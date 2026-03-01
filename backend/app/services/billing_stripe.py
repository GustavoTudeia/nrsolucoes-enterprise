from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
from uuid import UUID

import stripe
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.affiliate import Affiliate, CommissionLedger
from app.models.billing import Plan, TenantSubscription
from app.models.tenant import Tenant
from app.services.entitlements import apply_plan_to_subscription


def _init_stripe() -> None:
    stripe.api_key = settings.STRIPE_SECRET_KEY


def _to_amount(value_cents: Any) -> float:
    try:
        return float(value_cents or 0) / 100.0
    except Exception:
        return 0.0


def create_checkout_session(
    db: Session,
    tenant_id: UUID,
    user_email: str,
    stripe_price_id: str,
    affiliate: Affiliate | None = None,
) -> str:
    """Cria checkout de assinatura (Stripe Billing via Checkout) com metadata e, opcionalmente, desconto de afiliado."""
    _init_stripe()

    affiliate_id = str(affiliate.id) if affiliate else ""
    affiliate_code = affiliate.code if affiliate else ""
    discounts = None

    if affiliate and affiliate.discount_percent:
        # Reusa cupom se existir; senão cria e persiste (evita multiplicar cupons).
        coupon_id = affiliate.stripe_coupon_id
        if not coupon_id:
            c = stripe.Coupon.create(
                percent_off=float(affiliate.discount_percent),
                duration="forever",
                metadata={"affiliate_id": affiliate_id, "affiliate_code": affiliate_code},
                name=f"AFF_{affiliate_code}_DISC_{int(affiliate.discount_percent)}",
            )
            coupon_id = c.get("id")
            affiliate.stripe_coupon_id = coupon_id
            db.add(affiliate)
            db.commit()
        if coupon_id:
            discounts = [{"coupon": coupon_id}]

    session = stripe.checkout.Session.create(
        mode="subscription",
        customer_email=user_email,
        line_items=[{"price": stripe_price_id, "quantity": 1}],
        success_url=settings.STRIPE_SUCCESS_URL,
        cancel_url=settings.STRIPE_CANCEL_URL,
        client_reference_id=str(tenant_id),
        metadata={"tenant_id": str(tenant_id), "affiliate_id": affiliate_id, "affiliate_code": affiliate_code},
        subscription_data={"metadata": {"tenant_id": str(tenant_id), "affiliate_id": affiliate_id, "affiliate_code": affiliate_code}},
        discounts=discounts,
    )
    return session.url


def handle_stripe_webhook(db: Session, payload: bytes, sig_header: Optional[str]) -> Dict[str, Any]:
    """Webhook handler com:
    - verificação de assinatura em produção
    - parsing direto em dev/test se secret estiver vazio
    - update de subscription/plan (entitlements)
    - geração de comissão no invoice.paid
    """
    _init_stripe()

    # Parse event (dev/test bypass)
    try:
        if settings.ENV in ("dev", "test") and not settings.STRIPE_WEBHOOK_SECRET:
            event = json.loads(payload.decode("utf-8"))
        else:
            event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        return {"status": "invalid", "detail": str(e)}

    etype = event.get("type")
    obj = event.get("data", {}).get("object", {}) if isinstance(event, dict) else {}
    meta = (obj.get("metadata") or {}) if isinstance(obj, dict) else {}
    tenant_id = meta.get("tenant_id")

    # fallback tenant_id: localizar por subscription/customer já persistidos
    if not tenant_id and isinstance(obj, dict):
        sub_id = obj.get("id") if "subscription" in etype else obj.get("subscription")
        cust_id = obj.get("customer")
        rec = None
        if sub_id:
            rec = db.query(TenantSubscription).filter(TenantSubscription.provider_subscription_id == sub_id).first()
        if not rec and cust_id:
            rec = db.query(TenantSubscription).filter(TenantSubscription.provider_customer_id == cust_id).first()
        if rec:
            tenant_id = str(rec.tenant_id)

    def _set_status(tid: str, status: str) -> None:
        sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == UUID(tid)).first()
        if sub:
            sub.status = status
            db.add(sub)
            db.commit()

    # Subscription created/updated: map price -> plan and snapshot entitlements
    if etype in ("customer.subscription.created", "customer.subscription.updated"):
        if tenant_id and isinstance(obj, dict):
            items = (obj.get("items", {}).get("data", []) or [])
            price_id = None
            if items and isinstance(items[0], dict):
                price = items[0].get("price") or {}
                price_id = price.get("id")

            plan = None
            if price_id:
                plan = db.query(Plan).filter(Plan.stripe_price_id == price_id, Plan.is_active == True).first()

            sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == UUID(tenant_id)).first()
            if not sub:
                sub = TenantSubscription(tenant_id=UUID(tenant_id), status="active", entitlements_snapshot={})
                db.add(sub)
                db.flush()

            sub.provider_customer_id = obj.get("customer")
            sub.provider_subscription_id = obj.get("id")
            st = obj.get("status") or "active"
            sub.status = "active" if st in ("active", "trialing") else st
            db.add(sub)
            db.commit()

            if plan:
                apply_plan_to_subscription(db, UUID(tenant_id), plan, status=sub.status)

    # Checkout completed: store ids if present
    if etype == "checkout.session.completed":
        if not tenant_id and isinstance(obj, dict):
            tenant_id = obj.get("client_reference_id") or tenant_id
        if tenant_id and isinstance(obj, dict):
            sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == UUID(tenant_id)).first()
            if sub:
                sub.status = "active"
                sub.provider_customer_id = obj.get("customer")
                sub.provider_subscription_id = obj.get("subscription")
                db.add(sub)
                db.commit()

    # Commissioning: invoice paid -> ledger
    if etype in ("invoice.paid", "invoice.payment_succeeded"):
        if tenant_id and isinstance(obj, dict):
            tenant = db.query(Tenant).filter(Tenant.id == UUID(tenant_id)).first()
            if tenant and tenant.referred_by_affiliate_id:
                aff = db.query(Affiliate).filter(Affiliate.id == tenant.referred_by_affiliate_id, Affiliate.status == "active").first()
                if aff:
                    invoice_id = obj.get("id")
                    subscription_id = obj.get("subscription")
                    currency = (obj.get("currency") or "brl").lower()
                    amount_paid = _to_amount(obj.get("amount_paid"))
                    disc_amt = 0.0
                    for d in (obj.get("total_discount_amounts") or []):
                        disc_amt += _to_amount(d.get("amount"))
                    gross = round(amount_paid + disc_amt, 4)
                    commission = round(amount_paid * (float(aff.commission_percent) / 100.0), 4)

                    exists = db.query(CommissionLedger).filter(CommissionLedger.provider_invoice_id == invoice_id).first()
                    if not exists:
                        led = CommissionLedger(
                            affiliate_id=aff.id,
                            tenant_id=tenant.id,
                            provider_invoice_id=invoice_id,
                            provider_subscription_id=subscription_id,
                            currency=currency,
                            gross_amount=gross,
                            discount_amount=round(disc_amt, 4),
                            net_amount=round(amount_paid, 4),
                            commission_amount=commission,
                            status="pending",
                            available_at=datetime.utcnow() + timedelta(days=14),
                        )
                        db.add(led)
                        db.commit()

    if etype == "invoice.payment_failed":
        if tenant_id:
            _set_status(tenant_id, "past_due")

    if etype == "customer.subscription.deleted":
        if tenant_id:
            _set_status(tenant_id, "canceled")

    return {"status": "ok", "type": etype}
