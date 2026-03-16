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
from app.services.finance_service import choose_plan_price_id, ensure_onboarding_row, get_platform_billing_config, issue_fiscal_invoice, send_invoice_email, upsert_invoice_from_stripe
from app.services.analytics_service import capture_analytics_event
from app.services.tenant_health import upsert_tenant_health_snapshot


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
    plan: Plan,
    billing_period: str = "monthly",
    affiliate: Affiliate | None = None,
) -> str:
    _init_stripe()
    stripe_price_id = choose_plan_price_id(plan, billing_period)
    if not stripe_price_id:
        raise ValueError("Plano sem Stripe Price ID para o ciclo selecionado")

    affiliate_id = str(affiliate.id) if affiliate else ""
    affiliate_code = affiliate.code if affiliate else ""
    discounts = None

    if affiliate and affiliate.discount_percent:
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
        metadata={
            "tenant_id": str(tenant_id),
            "affiliate_id": affiliate_id,
            "affiliate_code": affiliate_code,
            "plan_key": plan.key,
            "billing_period": billing_period,
        },
        subscription_data={
            "metadata": {
                "tenant_id": str(tenant_id),
                "affiliate_id": affiliate_id,
                "affiliate_code": affiliate_code,
                "plan_key": plan.key,
                "billing_period": billing_period,
            }
        },
        discounts=discounts,
    )
    return session.url


def handle_stripe_webhook(db: Session, payload: bytes, sig_header: Optional[str]) -> Dict[str, Any]:
    _init_stripe()

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

    if etype in ("customer.subscription.created", "customer.subscription.updated") and tenant_id and isinstance(obj, dict):
        items = (obj.get("items", {}).get("data", []) or [])
        price_id = None
        if items and isinstance(items[0], dict):
            price_id = (items[0].get("price") or {}).get("id")

        plan = None
        if price_id:
            plan = db.query(Plan).filter(Plan.is_active == True).filter((Plan.stripe_price_id == price_id) | (Plan.stripe_price_id_monthly == price_id) | (Plan.stripe_price_id_annual == price_id)).first()

        sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == UUID(tenant_id)).first()
        if not sub:
            sub = TenantSubscription(tenant_id=UUID(tenant_id), status="active", entitlements_snapshot={})
            db.add(sub)
            db.flush()

        sub.provider_customer_id = obj.get("customer")
        sub.provider_subscription_id = obj.get("id")
        st = obj.get("status") or "active"
        sub.status = "active" if st in ("active", "trialing") else st
        sub.current_period_start = datetime.utcfromtimestamp(obj.get("current_period_start")) if obj.get("current_period_start") else None
        sub.current_period_end = datetime.utcfromtimestamp(obj.get("current_period_end")) if obj.get("current_period_end") else None
        sub.billing_cycle = meta.get("billing_period") or sub.billing_cycle or "monthly"
        db.add(sub)
        db.commit()

        if plan:
            apply_plan_to_subscription(db, UUID(tenant_id), plan, status=sub.status)
            sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == UUID(tenant_id)).first()
            sub.billing_cycle = meta.get("billing_period") or sub.billing_cycle or "monthly"
            db.add(sub)
            db.commit()

    if etype == "checkout.session.completed" and isinstance(obj, dict):
        if not tenant_id:
            tenant_id = obj.get("client_reference_id") or tenant_id
        if tenant_id:
            sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == UUID(tenant_id)).first()
            if sub:
                sub.status = "active"
                sub.provider_customer_id = obj.get("customer")
                sub.provider_subscription_id = obj.get("subscription")
                sub.billing_cycle = meta.get("billing_period") or sub.billing_cycle or "monthly"
                db.add(sub)
                db.commit()
                capture_analytics_event(db, "billing_checkout_completed", source="backend", tenant_id=UUID(tenant_id), module="billing", properties={"provider": "stripe"})
            ob = ensure_onboarding_row(db, UUID(tenant_id))
            ob.plan_selected_at = ob.plan_selected_at or datetime.utcnow()
            db.add(ob)
            db.commit()

    if etype in ("invoice.created", "invoice.finalized", "invoice.paid", "invoice.payment_succeeded", "invoice.payment_failed") and tenant_id and isinstance(obj, dict):
        invoice = upsert_invoice_from_stripe(db, UUID(tenant_id), obj)
        cfg = get_platform_billing_config(db)
        if etype in ("invoice.paid", "invoice.payment_succeeded"):
            ob = ensure_onboarding_row(db, UUID(tenant_id))
            ob.payment_confirmed_at = ob.payment_confirmed_at or datetime.utcnow()
            db.add(ob)
            if cfg.auto_issue_on_payment:
                issue_fiscal_invoice(db, invoice)
            if cfg.auto_email_invoice and invoice.fiscal_status in {"issued", "sent"}:
                send_invoice_email(db, invoice)
            capture_analytics_event(db, "payment_succeeded", source="backend", tenant_id=UUID(tenant_id), module="billing", properties={"invoice_id": str(invoice.id), "amount_paid": invoice.amount_paid, "fiscal_status": invoice.fiscal_status})
            upsert_tenant_health_snapshot(db, UUID(tenant_id))
            db.commit()
        elif etype == "invoice.payment_failed":
            _set_status(tenant_id, "past_due")
            capture_analytics_event(db, "payment_failed", source="backend", tenant_id=UUID(tenant_id), module="billing", properties={"provider_invoice_id": obj.get("id")})
            upsert_tenant_health_snapshot(db, UUID(tenant_id))
            db.commit()

    if etype in ("invoice.paid", "invoice.payment_succeeded") and tenant_id and isinstance(obj, dict):
        tenant = db.query(Tenant).filter(Tenant.id == UUID(tenant_id)).first()
        if tenant and tenant.referred_by_affiliate_id:
            aff = db.query(Affiliate).filter(Affiliate.id == tenant.referred_by_affiliate_id, Affiliate.status == "active").first()
            if aff:
                invoice_id = obj.get("id")
                subscription_id = obj.get("subscription")
                currency = (obj.get("currency") or "brl").lower()
                amount_paid = _to_amount(obj.get("amount_paid"))
                disc_amt = sum(_to_amount(d.get("amount")) for d in (obj.get("total_discount_amounts") or []))
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

    if etype == "customer.subscription.deleted" and tenant_id:
        _set_status(tenant_id, "canceled")
        capture_analytics_event(db, "subscription_canceled", source="backend", tenant_id=UUID(tenant_id), module="billing", properties={"provider": "stripe"})
        upsert_tenant_health_snapshot(db, UUID(tenant_id))

    return {"status": "ok", "type": etype}
