from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Header, Query
from sqlalchemy.orm import Session
from uuid import UUID

from app.api.deps import get_current_user, tenant_id_from_user, require_any_role
from app.core.errors import BadRequest, NotFound
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_OWNER
from app.core.config import settings
from app.db.session import get_db
from app.models.affiliate import Affiliate
from app.models.billing import Plan, TenantSubscription, BillingInvoice
from app.models.tenant import Tenant
from app.schemas.billing import PlanOut, SubscriptionOut, CheckoutSessionOut, PortalSessionOut, InvoiceOut, BillingProfileIn, BillingProfileOut, BillingProfileStatusOut, OnboardingOverviewOut
from app.services.entitlements import resolve_entitlements_for_user
from app.services.billing_stripe import handle_stripe_webhook, create_checkout_session as stripe_create_checkout
from app.services.finance_service import get_or_create_billing_profile, billing_profile_missing_fields, billing_profile_is_complete, build_onboarding_overview, send_invoice_email
from app.services.analytics_service import capture_analytics_event
from app.services.tenant_health import upsert_tenant_health_snapshot

public_router = APIRouter(prefix="/billing")
router = APIRouter(prefix="/billing")


@public_router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)):
    plans = db.query(Plan).filter(Plan.is_active == True).order_by(Plan.key.asc()).all()
    return [PlanOut(id=p.id, key=p.key, name=p.name, features=p.features or {}, limits=p.limits or {}, price_monthly=p.price_monthly, price_annual=p.price_annual, is_custom_price=p.is_custom_price or False, stripe_price_id_monthly=p.stripe_price_id_monthly or p.stripe_price_id, stripe_price_id_annual=p.stripe_price_id_annual) for p in plans]


@public_router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(default="", alias="Stripe-Signature"), db: Session = Depends(get_db)):
    if not settings.STRIPE_ENABLED:
        raise BadRequest("Stripe desabilitado")
    payload = await request.body()
    sig = stripe_signature or request.headers.get("stripe-signature") or ""
    if not sig and settings.ENV not in ("dev", "test"):
        raise BadRequest("Header Stripe-Signature ausente")
    return handle_stripe_webhook(db, payload, sig)


@router.get("/subscription", response_model=SubscriptionOut)
def get_subscription(db: Session = Depends(get_db), user=Depends(get_current_user), tenant_id=Depends(tenant_id_from_user)):
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    ent = resolve_entitlements_for_user(db, user)
    ent_snap = {"features": ent.features, "limits": ent.limits}
    if not sub:
        return SubscriptionOut(status="none", plan_id=None, provider=None, current_period_end=None, billing_cycle=None, entitlements_snapshot=ent_snap)
    return SubscriptionOut(status=sub.status, plan_id=sub.plan_id, provider=sub.provider, current_period_end=sub.current_period_end, billing_cycle=sub.billing_cycle, entitlements_snapshot=ent_snap)


@router.get("/profile", response_model=BillingProfileOut)
def get_billing_profile(db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    profile = get_or_create_billing_profile(db, tenant_id)
    return BillingProfileOut(
        id=profile.id,
        tenant_id=profile.tenant_id,
        legal_name=profile.legal_name or "",
        trade_name=profile.trade_name,
        cnpj_number=profile.cnpj_number or "",
        state_registration=profile.state_registration,
        municipal_registration=profile.municipal_registration,
        tax_regime=profile.tax_regime,
        contact_name=profile.contact_name,
        contact_email=profile.contact_email,
        finance_email=profile.finance_email,
        contact_phone=profile.contact_phone,
        address_street=profile.address_street,
        address_number=profile.address_number,
        address_complement=profile.address_complement,
        address_district=profile.address_district,
        city=profile.city,
        state=profile.state,
        postal_code=profile.postal_code,
        country_code=profile.country_code,
        notes=profile.notes,
        is_complete=billing_profile_is_complete(profile),
        created_at=profile.created_at,
        updated_at=profile.updated_at,
    )


@router.put("/profile", response_model=BillingProfileOut)
def upsert_billing_profile(payload: BillingProfileIn, db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    profile = get_or_create_billing_profile(db, tenant_id)
    for field in payload.model_fields:
        setattr(profile, field, getattr(payload, field))
    db.add(profile)
    event_name = "billing_profile_completed" if billing_profile_is_complete(profile) else "billing_profile_updated"
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, event_name, source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="billing", properties={"missing_fields": billing_profile_missing_fields(profile)})
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit()
    db.refresh(profile)
    return BillingProfileOut(id=profile.id, tenant_id=profile.tenant_id, **payload.model_dump(), is_complete=billing_profile_is_complete(profile), created_at=profile.created_at, updated_at=profile.updated_at)


@router.get("/profile/status", response_model=BillingProfileStatusOut)
def get_billing_profile_status(db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    profile = get_or_create_billing_profile(db, tenant_id)
    missing = billing_profile_missing_fields(profile)
    return BillingProfileStatusOut(is_complete=not missing, missing_fields=missing)


@router.get("/onboarding", response_model=OnboardingOverviewOut)
def billing_onboarding(db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    return OnboardingOverviewOut(**build_onboarding_overview(db, tenant_id))


@router.post("/checkout-session", response_model=CheckoutSessionOut)
def create_checkout_session_endpoint(plan_key: str = Query(...), billing_period: str = Query(default="monthly"), affiliate_code: str = Query(default=""), db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    if not settings.STRIPE_ENABLED:
        raise BadRequest("Stripe desabilitado")

    profile = get_or_create_billing_profile(db, tenant_id)
    missing = billing_profile_missing_fields(profile)
    if missing:
        raise BadRequest(f"Complete o perfil de faturamento antes do checkout: {', '.join(missing)}")

    plan = db.query(Plan).filter(Plan.key == plan_key, Plan.is_active == True).first()
    if not plan:
        raise BadRequest("Plano inválido")

    affiliate = None
    if affiliate_code:
        affiliate = db.query(Affiliate).filter(Affiliate.code == affiliate_code.strip(), Affiliate.status == "active").first()
    if not affiliate:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if tenant and tenant.referred_by_affiliate_id:
            affiliate = db.query(Affiliate).filter(Affiliate.id == tenant.referred_by_affiliate_id, Affiliate.status == "active").first()

    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    if not sub:
        sub = TenantSubscription(tenant_id=tenant_id, plan_id=plan.id, status="incomplete", provider="stripe", billing_cycle=billing_period)
        db.add(sub)
        db.flush()
    else:
        sub.plan_id = plan.id
        sub.billing_cycle = billing_period
        db.add(sub)
        db.commit()

    checkout_url = stripe_create_checkout(db=db, tenant_id=tenant_id, user_email=user.email, plan=plan, billing_period=billing_period, affiliate=affiliate)
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "billing_checkout_started", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="billing", properties={"plan_key": plan.key, "billing_period": billing_period, "affiliate_code": affiliate.code if affiliate else None})
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit()
    return CheckoutSessionOut(checkout_url=checkout_url)


@router.post("/portal", response_model=PortalSessionOut)
def create_portal_session(db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    if not settings.STRIPE_ENABLED:
        raise BadRequest("Stripe desabilitado")
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    if not sub or not sub.provider_customer_id:
        raise BadRequest("Cliente Stripe não encontrado")

    import stripe
    stripe.api_key = settings.STRIPE_SECRET_KEY
    sess = stripe.billing_portal.Session.create(customer=sub.provider_customer_id, return_url=settings.STRIPE_BILLING_PORTAL_RETURN_URL)
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "billing_portal_opened", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="billing", properties={})
    db.commit()
    return PortalSessionOut(url=sess.url)


@router.get("/invoices", response_model=list[InvoiceOut])
def list_invoices(db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    rows = db.query(BillingInvoice).filter(BillingInvoice.tenant_id == tenant_id).order_by(BillingInvoice.created_at.desc()).all()
    return [InvoiceOut(id=str(i.id), number=i.source_invoice_id, status=i.payment_status, currency=i.currency, amount_due=i.amount_due, amount_paid=i.amount_paid, created=int(i.created_at.timestamp()) if i.created_at else None, hosted_invoice_url=i.hosted_invoice_url, invoice_pdf=i.invoice_pdf_url, fiscal_status=i.fiscal_status, external_invoice_number=i.external_invoice_number, fiscal_pdf_url=i.fiscal_pdf_url, emailed_at=i.emailed_at) for i in rows]


@router.post("/invoices/{invoice_id}/request-issue", response_model=dict)
def request_issue_invoice(invoice_id: UUID, db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    invoice = db.query(BillingInvoice).filter(BillingInvoice.id == invoice_id, BillingInvoice.tenant_id == tenant_id).first()
    if not invoice:
        raise NotFound("Fatura não encontrada")
    if invoice.payment_status != "paid":
        raise BadRequest("A emissão fiscal só pode ser solicitada para faturas pagas")
    invoice.fiscal_status = "ready_to_issue"
    db.add(invoice)
    capture_analytics_event(db, "invoice_issue_requested", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=(user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None), module="billing", properties={"invoice_id": str(invoice.id)})
    db.commit()
    return {"ok": True, "status": invoice.fiscal_status}


@router.post("/invoices/{invoice_id}/resend-email", response_model=dict)
def resend_invoice_email(invoice_id: UUID, recipient_email: str | None = Query(default=None), db: Session = Depends(get_db), user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])), tenant_id=Depends(tenant_id_from_user)):
    invoice = db.query(BillingInvoice).filter(BillingInvoice.id == invoice_id, BillingInvoice.tenant_id == tenant_id).first()
    if not invoice:
        raise NotFound("Fatura não encontrada")
    ok = send_invoice_email(db, invoice, recipient_email)
    capture_analytics_event(db, "invoice_sent", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=(user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None), module="billing", properties={"invoice_id": str(invoice.id), "ok": bool(ok)})
    db.commit()
    return {"ok": bool(ok), "emailed_at": invoice.emailed_at.isoformat() if invoice.emailed_at else None}
