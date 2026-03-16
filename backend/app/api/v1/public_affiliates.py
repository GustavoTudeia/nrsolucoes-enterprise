from __future__ import annotations

from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.affiliate import Affiliate, ReferralAttribution
from app.models.tenant import Tenant, TenantSettings
from app.models.billing import TenantSubscription, Plan
from app.models.user import User, Role, UserRoleScope
from app.models.org import CNPJ
from app.core.security import hash_password, create_access_token
from app.core.errors import BadRequest, NotFound
from app.core.config import settings
from app.services.template_packs import apply_pack_to_tenant
from app.services.finance_service import get_or_create_billing_profile, ensure_onboarding_row
from app.schemas.public_signup import PublicSignupRequest, PublicSignupResponse
from app.schemas.affiliate import AffiliatePublicOut
from app.services.analytics_service import capture_analytics_event
from app.services.tenant_health import upsert_tenant_health_snapshot

router = APIRouter(prefix="/public")

def _normalize_code(code: str) -> str:
    return (code or "").strip()

@router.get("/affiliate/resolve", response_model=AffiliatePublicOut)
def resolve_affiliate(code: str, db: Session = Depends(get_db)):
    code = _normalize_code(code)
    a = db.query(Affiliate).filter(Affiliate.code == code, Affiliate.status == "active").first()
    if not a:
        raise NotFound("Afiliado não encontrado")
    return AffiliatePublicOut(affiliate_code=a.code, discount_percent=a.discount_percent)

@router.post("/affiliate/touch")
def touch_affiliate(code: str, db: Session = Depends(get_db)):
    # Endpoint para tracking de clique. O frontend pode chamar ao abrir a landing.
    code = _normalize_code(code)
    a = db.query(Affiliate).filter(Affiliate.code == code, Affiliate.status == "active").first()
    if not a:
        raise NotFound("Afiliado não encontrado")
    capture_analytics_event(db, "affiliate_touch", source="public", distinct_key=f"affiliate:{a.code}", channel="affiliate", properties={"affiliate_code": a.code})
    db.commit()
    return {"status": "ok"}

@router.post("/signup", response_model=PublicSignupResponse)
def public_signup(payload: PublicSignupRequest, db: Session = Depends(get_db)):
    # Validações de unicidade
    if db.query(Tenant).filter(Tenant.slug == payload.slug).first():
        raise BadRequest("Slug já em uso")
    if db.query(User).filter(User.email == payload.admin_email).first():
        raise BadRequest("E-mail já cadastrado")
    if payload.admin_cpf:
        if db.query(User).filter(User.cpf == payload.admin_cpf).first():
            raise BadRequest("CPF já cadastrado")

    # Cria tenant
    tenant = Tenant(name=payload.company_name, slug=payload.slug, is_active=True)
    db.add(tenant)
    db.flush()

    # Cria settings do tenant
    db.add(TenantSettings(tenant_id=tenant.id, min_anon_threshold=settings.DEFAULT_MIN_ANON_THRESHOLD))

    # Se informou CNPJ, cria o registro
    if payload.cnpj:
        cnpj_obj = CNPJ(
            tenant_id=tenant.id,
            cnpj_number=payload.cnpj,  # Campo correto é cnpj_number
            legal_name=payload.company_name,
            trade_name=payload.company_name,
            is_active=True,
        )
        db.add(cnpj_obj)

    # Trial automático: aplica plano selecionado ou START como fallback
    desired_key = (payload.plan_key or "").strip().upper() or "START"
    plan = db.query(Plan).filter(Plan.key == desired_key, Plan.is_active == True).first()
    if not plan:
        plan = db.query(Plan).filter(Plan.key == "START", Plan.is_active == True).first()
    if plan:
        db.add(
            TenantSubscription(
                tenant_id=tenant.id,
                status="trial",
                plan_id=plan.id,
                entitlements_snapshot={"features": plan.features or {}, "limits": plan.limits or {}},
            )
        )
    else:
        # Fallback mínimo
        db.add(
            TenantSubscription(
                tenant_id=tenant.id,
                status="trial",
                entitlements_snapshot={"features": {"LMS": True}, "limits": {"cnpj_max": 1, "employees_max": 50}},
            )
        )

    billing_profile = get_or_create_billing_profile(db, tenant.id)
    billing_profile.legal_name = payload.company_name
    billing_profile.trade_name = payload.company_name
    billing_profile.cnpj_number = payload.cnpj or billing_profile.cnpj_number
    billing_profile.contact_name = payload.admin_name
    billing_profile.contact_email = payload.admin_email
    billing_profile.finance_email = payload.admin_email
    billing_profile.contact_phone = payload.admin_phone
    db.add(billing_profile)

    onboarding = ensure_onboarding_row(db, tenant.id)
    onboarding.plan_selected_at = datetime.utcnow()
    db.add(onboarding)

    # Onboarding: aplica template pack
    pack_key = (getattr(settings, "AUTO_APPLY_TEMPLATE_PACK_KEY", "") or "").strip()
    if pack_key:
        apply_pack_to_tenant(db, pack_key=pack_key, tenant_id=tenant.id)

    # Affiliate attribution (optional)
    if payload.affiliate_code:
        a = db.query(Affiliate).filter(Affiliate.code == payload.affiliate_code, Affiliate.status == "active").first()
        if a:
            tenant.referred_by_affiliate_id = a.id
            db.add(ReferralAttribution(
                tenant_id=tenant.id,
                affiliate_id=a.id,
                first_seen_at=datetime.utcnow(),
                last_seen_at=datetime.utcnow(),
                locked_at=datetime.utcnow(),
                status="signed_up",
                meta={"channel": "public_signup"},
            ))

    # Cria usuário admin com novos campos
    u = User(
        tenant_id=tenant.id,
        email=payload.admin_email,
        full_name=payload.admin_name,
        cpf=payload.admin_cpf,
        phone=payload.admin_phone,
        password_hash=hash_password(payload.admin_password),
        is_active=True,
        is_platform_admin=False,
        must_change_password=False,
        login_count=0,
        failed_login_count=0,
    )
    db.add(u)
    db.flush()

    # Atribui papel OWNER (dono da conta) - único papel necessário para o criador
    owner_role = db.query(Role).filter(Role.key == "OWNER").first()
    if not owner_role:
        owner_role = Role(key="OWNER", name="Proprietário", description="Dono da conta", is_system=True)
        db.add(owner_role)
        db.flush()

    db.add(UserRoleScope(
        user_id=u.id,
        role_id=owner_role.id,
        tenant_id=tenant.id,
        granted_at=datetime.utcnow(),
        is_active=True,
    ))

    capture_analytics_event(db, "public_signup_completed", source="public", tenant_id=tenant.id, user_id=u.id, actor_role="OWNER", module="onboarding", distinct_key=payload.admin_email, channel="public_signup", properties={"plan_key": desired_key, "has_cnpj": bool(payload.cnpj), "affiliate_code": payload.affiliate_code})
    capture_analytics_event(db, "tenant_created", source="backend", tenant_id=tenant.id, user_id=u.id, actor_role="OWNER", module="onboarding", distinct_key=payload.admin_email, properties={"plan_key": desired_key})
    upsert_tenant_health_snapshot(db, tenant.id)
    db.commit()

    token = create_access_token(subject=u.email, extra={"uid": str(u.id), "tid": str(tenant.id), "pla": False})
    return PublicSignupResponse(tenant_id=tenant.id, access_token=token)
