from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.session import get_db
from app.schemas.tenant import TenantCreate, TenantOut
from app.schemas.common import Page
from app.models.tenant import Tenant, TenantSettings
from app.models.billing import TenantSubscription, Plan
from app.core.config import settings
from app.api.deps import require_platform_admin, get_request_meta
from app.core.audit import make_audit_event
from app.services.template_packs import apply_pack_to_tenant
from app.services.finance_service import get_or_create_billing_profile, ensure_onboarding_row

router = APIRouter(prefix="/tenants")


@router.get("", response_model=Page[TenantOut])
def list_tenants(
    q: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin = Depends(require_platform_admin),
):
    base = db.query(Tenant)
    if q:
        like = f"%{q.strip()}%"
        base = base.filter((Tenant.name.ilike(like)) | (Tenant.slug.ilike(like)))
    total = base.count()
    rows = (
        base.order_by(Tenant.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    def _to_out(t: Tenant) -> TenantOut:
        return TenantOut(
            id=t.id,
            name=t.name,
            slug=t.slug,
            is_active=t.is_active,
            plan_key=(t.subscription.plan.key if (t.subscription and t.subscription.plan) else None),
            plan_name=(t.subscription.plan.name if (t.subscription and t.subscription.plan) else None),
            subscription_status=(t.subscription.status if t.subscription else None),
        )
    return Page(items=[_to_out(t) for t in rows], total=total, limit=limit, offset=offset)

@router.post("", response_model=TenantOut)
def create_tenant(
    payload: TenantCreate,
    db: Session = Depends(get_db),
    admin = Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    tenant = Tenant(name=payload.name, slug=payload.slug, is_active=True)
    db.add(tenant)
    db.flush()

    ts = TenantSettings(tenant_id=tenant.id, min_anon_threshold=settings.DEFAULT_MIN_ANON_THRESHOLD)
    db.add(ts)

    # Trial: aplica um plano default (START) para que features/limits funcionem imediatamente (DEV/onboarding).
    plan = db.query(Plan).filter(Plan.key == "START").first()
    if plan:
        sub = TenantSubscription(
            tenant_id=tenant.id,
            status="trial",
            plan_id=plan.id,
            entitlements_snapshot={"features": plan.features or {}, "limits": plan.limits or {}},
        )
    else:
        sub = TenantSubscription(
            tenant_id=tenant.id,
            status="trial",
            entitlements_snapshot={"features": {"LMS": True}, "limits": {}},
        )
    db.add(sub)

    billing_profile = get_or_create_billing_profile(db, tenant.id)
    billing_profile.legal_name = tenant.name
    billing_profile.trade_name = tenant.name
    db.add(billing_profile)

    ensure_onboarding_row(db, tenant.id)

    # Onboarding: aplica automaticamente o pack padrão de templates (NR-1) ao novo tenant.
    pack_key = (getattr(settings, 'AUTO_APPLY_TEMPLATE_PACK_KEY', '') or '').strip()
    if pack_key:
        apply_pack_to_tenant(db, pack_key=pack_key, tenant_id=tenant.id)

    ae = make_audit_event(
        tenant_id=None,
        actor_user_id=admin.id,
        action="CREATE",
        entity_type="TENANT",
        entity_id=tenant.id,
        before=None,
        after={"name": tenant.name},
        ip=meta.get("ip"),
        user_agent=meta.get("user_agent"),
        request_id=meta.get("request_id"),
    )
    db.add(ae)
    db.commit()
    db.refresh(tenant)
    return TenantOut(id=tenant.id, name=tenant.name, slug=tenant.slug, is_active=tenant.is_active, plan_key=(tenant.subscription.plan.key if (tenant.subscription and tenant.subscription.plan) else None), plan_name=(tenant.subscription.plan.name if (tenant.subscription and tenant.subscription.plan) else None), subscription_status=(tenant.subscription.status if tenant.subscription else None))


@router.get("/{tenant_id}", response_model=TenantOut)
def get_tenant(tenant_id: UUID, db: Session = Depends(get_db), admin = Depends(require_platform_admin)):
    t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not t:
        from app.core.errors import NotFound
        raise NotFound("Tenant não encontrado")
    return TenantOut(id=t.id, name=t.name, slug=t.slug, is_active=t.is_active, plan_key=(t.subscription.plan.key if (t.subscription and t.subscription.plan) else None), plan_name=(t.subscription.plan.name if (t.subscription and t.subscription.plan) else None), subscription_status=(t.subscription.status if t.subscription else None))
