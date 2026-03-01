from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Header
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, tenant_id_from_user, require_any_role
from app.core.errors import BadRequest, Forbidden
from app.core.rbac import ROLE_TENANT_ADMIN
from app.core.config import settings
from app.db.session import get_db
from app.models.billing import Plan, TenantSubscription
from app.schemas.billing import PlanOut, SubscriptionOut, CheckoutSessionOut, PortalSessionOut, InvoiceOut
from app.services.entitlements import resolve_entitlements_for_user
from app.services.billing_stripe import handle_stripe_webhook

router = APIRouter(prefix="/billing")


@router.get("/plans", response_model=list[PlanOut])
def list_plans(db: Session = Depends(get_db)):
    plans = db.query(Plan).filter(Plan.is_active == True).order_by(Plan.key.asc()).all()
    return [PlanOut(id=p.id, key=p.key, name=p.name, features=p.features or {}, limits=p.limits or {}) for p in plans]


@router.get("/subscription", response_model=SubscriptionOut)
def get_subscription(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    tenant_id=Depends(tenant_id_from_user),
):
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    ent = resolve_entitlements_for_user(db, user)
    # O schema espera um dict (Pydantic v2 não aceita dataclass diretamente aqui)
    ent_snap = {"features": ent.features, "limits": ent.limits}
    if not sub:
        return SubscriptionOut(status="none", plan_id=None, provider=None, current_period_end=None, entitlements_snapshot=ent_snap)
    return SubscriptionOut(
        status=sub.status,
        plan_id=sub.plan_id,
        provider=sub.provider,
        current_period_end=sub.current_period_end,
        entitlements_snapshot=ent_snap,
    )


@router.post("/checkout-session", response_model=CheckoutSessionOut)
def create_checkout_session(
    plan_key: str,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN])),
    tenant_id=Depends(tenant_id_from_user),
):
    if not settings.STRIPE_ENABLED:
        raise BadRequest("Stripe desabilitado")

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY

    plan = db.query(Plan).filter(Plan.key == plan_key, Plan.is_active == True).first()
    if not plan or not plan.stripe_price_id:
        raise BadRequest("Plano inválido")

    # Recupera ou cria subscription row
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    if not sub:
        sub = TenantSubscription(tenant_id=tenant_id, plan_id=plan.id, status="incomplete", provider="stripe")
        db.add(sub)
        db.flush()

    # Create session
    # Use explicit URLs (configurable per environment) to avoid relying on any implicit frontend base URL.
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": plan.stripe_price_id, "quantity": 1}],
        success_url=settings.STRIPE_SUCCESS_URL,
        cancel_url=settings.STRIPE_CANCEL_URL,
        metadata={"tenant_id": str(tenant_id), "plan_key": plan.key},
    )
    return CheckoutSessionOut(checkout_url=session.url)


@router.post("/portal", response_model=PortalSessionOut)
def create_portal_session(
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN])),
    tenant_id=Depends(tenant_id_from_user),
):
    if not settings.STRIPE_ENABLED:
        raise BadRequest("Stripe desabilitado")

    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    if not sub or not sub.provider_customer_id:
        raise BadRequest("Cliente Stripe não encontrado")

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    sess = stripe.billing_portal.Session.create(
        customer=sub.provider_customer_id,
        return_url=settings.STRIPE_BILLING_PORTAL_RETURN_URL,
    )
    return PortalSessionOut(url=sess.url)


@router.get("/invoices", response_model=list[InvoiceOut])
def list_invoices(
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN])),
    tenant_id=Depends(tenant_id_from_user),
):
    if not settings.STRIPE_ENABLED:
        return []

    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    if not sub or not sub.provider_customer_id:
        return []

    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    invs = stripe.Invoice.list(customer=sub.provider_customer_id, limit=10)
    out: list[InvoiceOut] = []
    for i in invs.data:
        out.append(
            InvoiceOut(
                id=i.id,
                number=getattr(i, "number", None),
                status=getattr(i, "status", None),
                currency=getattr(i, "currency", None),
                amount_due=getattr(i, "amount_due", None),
                amount_paid=getattr(i, "amount_paid", None),
                created=getattr(i, "created", None),
                hosted_invoice_url=getattr(i, "hosted_invoice_url", None),
                invoice_pdf=getattr(i, "invoice_pdf", None),
            )
        )
    return out


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(default="", alias="Stripe-Signature"),
    db: Session = Depends(get_db),
):
    """Webhook Stripe (produção).

    Observações:
    - Stripe envia o corpo bruto + header Stripe-Signature.
    - Validamos a assinatura com STRIPE_WEBHOOK_SECRET.
    - A lógica de update de assinatura/entitlements fica centralizada em services.billing_stripe.
    """

    if not settings.STRIPE_ENABLED:
        raise BadRequest("Stripe desabilitado")

    payload = await request.body()
    sig = stripe_signature or request.headers.get("stripe-signature") or ""
    if not sig:
        raise BadRequest("Header Stripe-Signature ausente")

    # handle_stripe_webhook já valida a assinatura e aplica updates no banco
    return handle_stripe_webhook(db, payload, sig)
