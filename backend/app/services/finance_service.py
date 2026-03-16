from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional
from urllib import request as urllib_request
from urllib.error import HTTPError, URLError
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.billing import BillingInvoice, BillingProfile, PlatformBillingConfig, TenantOnboarding, TenantSubscription, Plan
from app.models.org import CNPJ
from app.models.user import User
from app.models.campaign import Campaign, SurveyResponse
from app.services.email_service import EmailService

REQUIRED_BILLING_FIELDS = [
    "legal_name",
    "cnpj_number",
    "finance_email",
    "address_street",
    "address_number",
    "address_district",
    "city",
    "state",
    "postal_code",
]


def _sanitize_document(value: Optional[str]) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


def get_or_create_billing_profile(db: Session, tenant_id: UUID) -> BillingProfile:
    profile = db.query(BillingProfile).filter(BillingProfile.tenant_id == tenant_id).first()
    if profile:
        return profile
    cnpj = db.query(CNPJ).filter(CNPJ.tenant_id == tenant_id).order_by(CNPJ.created_at.asc()).first()
    profile = BillingProfile(
        tenant_id=tenant_id,
        legal_name=cnpj.legal_name if cnpj else None,
        trade_name=cnpj.trade_name if cnpj else None,
        cnpj_number=cnpj.cnpj_number if cnpj else None,
    )
    db.add(profile)
    db.flush()
    return profile


def billing_profile_missing_fields(profile: BillingProfile | None) -> list[str]:
    if not profile:
        return REQUIRED_BILLING_FIELDS.copy()
    missing = []
    for field in REQUIRED_BILLING_FIELDS:
        value = getattr(profile, field, None)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(field)
    if profile.cnpj_number and len(_sanitize_document(profile.cnpj_number)) != 14 and "cnpj_number" not in missing:
        missing.append("cnpj_number")
    return missing


def billing_profile_is_complete(profile: BillingProfile | None) -> bool:
    return not billing_profile_missing_fields(profile)


def get_platform_billing_config(db: Session) -> PlatformBillingConfig:
    cfg = db.query(PlatformBillingConfig).filter(PlatformBillingConfig.key == "default").first()
    if cfg:
        return cfg
    cfg = PlatformBillingConfig(key="default", provider_type="manual", provider_environment="sandbox")
    db.add(cfg)
    db.flush()
    return cfg


def ensure_onboarding_row(db: Session, tenant_id: UUID) -> TenantOnboarding:
    row = db.query(TenantOnboarding).filter(TenantOnboarding.tenant_id == tenant_id).first()
    if row:
        return row
    row = TenantOnboarding(tenant_id=tenant_id, status="in_progress", current_step="billing_profile")
    db.add(row)
    db.flush()
    return row


def build_onboarding_overview(db: Session, tenant_id: UUID) -> dict[str, Any]:
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    profile = get_or_create_billing_profile(db, tenant_id)
    onboarding = ensure_onboarding_row(db, tenant_id)

    cnpj_count = db.query(func.count(CNPJ.id)).filter(CNPJ.tenant_id == tenant_id).scalar() or 0
    user_count = db.query(func.count(User.id)).filter(User.tenant_id == tenant_id, User.is_active == True).scalar() or 0
    campaign_count = db.query(func.count(Campaign.id)).filter(Campaign.tenant_id == tenant_id).scalar() or 0
    response_count = (
        db.query(func.count(SurveyResponse.id))
        .join(Campaign, Campaign.id == SurveyResponse.campaign_id)
        .filter(Campaign.tenant_id == tenant_id)
        .scalar()
        or 0
    )

    has_plan = bool(sub and sub.plan_id)
    payment_confirmed = bool(sub and sub.status == "active")
    profile_ok = billing_profile_is_complete(profile)

    steps = [
        {"key": "billing_profile", "title": "Perfil de faturamento", "description": "Complete os dados fiscais e financeiros.", "href": "/billing", "status": "done" if profile_ok else "current"},
        {"key": "plan_payment", "title": "Plano e pagamento", "description": "Escolha o plano, ciclo e finalize o checkout.", "href": "/billing", "status": "done" if payment_confirmed else ("current" if profile_ok else "blocked")},
        {"key": "org_setup", "title": "Estrutura organizacional", "description": "Cadastre CNPJ e unidades.", "href": "/org/cnpjs", "status": "done" if cnpj_count > 0 else ("current" if has_plan else "blocked")},
        {"key": "users_people", "title": "Usuários e colaboradores", "description": "Cadastre os primeiros usuários e colaboradores.", "href": "/colaboradores", "status": "done" if user_count > 1 else ("current" if cnpj_count > 0 else "blocked")},
        {"key": "first_campaign", "title": "Primeira campanha", "description": "Publique a primeira campanha/questionário.", "href": "/campanhas", "status": "done" if campaign_count > 0 else ("current" if user_count > 1 else "blocked")},
        {"key": "first_response", "title": "Primeira resposta", "description": "Colete a primeira resposta/evidência.", "href": "/resultados", "status": "done" if response_count > 0 else ("current" if campaign_count > 0 else "blocked")},
    ]

    done = len([s for s in steps if s["status"] == "done"])
    progress = int(round((done / len(steps)) * 100)) if steps else 0
    current = next((s["key"] for s in steps if s["status"] == "current"), None)
    status = "completed" if done == len(steps) else "in_progress"

    onboarding.status = status
    onboarding.current_step = current
    if profile_ok and onboarding.billing_profile_completed_at is None:
        onboarding.billing_profile_completed_at = datetime.utcnow()
    if payment_confirmed and onboarding.payment_confirmed_at is None:
        onboarding.payment_confirmed_at = datetime.utcnow()
    if cnpj_count > 0 and onboarding.org_structure_completed_at is None:
        onboarding.org_structure_completed_at = datetime.utcnow()
    if user_count > 1 and onboarding.first_user_completed_at is None:
        onboarding.first_user_completed_at = datetime.utcnow()
    if campaign_count > 0 and onboarding.first_campaign_completed_at is None:
        onboarding.first_campaign_completed_at = datetime.utcnow()
    if response_count > 0 and onboarding.first_response_completed_at is None:
        onboarding.first_response_completed_at = datetime.utcnow()
    if status == "completed" and onboarding.completed_at is None:
        onboarding.completed_at = datetime.utcnow()
    db.add(onboarding)
    db.flush()

    return {
        "status": status,
        "progress_percent": progress,
        "current_step": current,
        "steps": steps,
        "metrics": {"cnpjs": int(cnpj_count), "users": int(user_count), "campaigns": int(campaign_count), "responses": int(response_count)},
    }


def choose_plan_price_id(plan: Plan, billing_period: str) -> str | None:
    billing_period = (billing_period or "monthly").lower()
    if billing_period == "annual":
        return plan.stripe_price_id_annual or plan.stripe_price_id or None
    return plan.stripe_price_id_monthly or plan.stripe_price_id or None


def _dt_from_unix(value: Any) -> datetime | None:
    try:
        if value is None:
            return None
        return datetime.utcfromtimestamp(int(value))
    except Exception:
        return None


def upsert_invoice_from_stripe(db: Session, tenant_id: UUID, obj: dict[str, Any]) -> BillingInvoice:
    source_invoice_id = obj.get("id")
    invoice = None
    if source_invoice_id:
        invoice = db.query(BillingInvoice).filter(BillingInvoice.source_provider == "stripe", BillingInvoice.source_invoice_id == source_invoice_id).first()
    if not invoice:
        sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
        invoice = BillingInvoice(
            tenant_id=tenant_id,
            subscription_id=sub.id if sub else None,
            source_provider="stripe",
            source_invoice_id=source_invoice_id,
            source_subscription_id=obj.get("subscription"),
            currency=(obj.get("currency") or "brl").lower(),
        )
        db.add(invoice)
        db.flush()

    profile = get_or_create_billing_profile(db, tenant_id)
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    plan = db.query(Plan).filter(Plan.id == sub.plan_id).first() if sub and sub.plan_id else None

    invoice.subscription_id = sub.id if sub else invoice.subscription_id
    invoice.source_subscription_id = obj.get("subscription") or invoice.source_subscription_id
    invoice.plan_key = plan.key if plan else invoice.plan_key
    invoice.billing_cycle = sub.billing_cycle if sub else invoice.billing_cycle
    invoice.payment_status = (obj.get("status") or invoice.payment_status or "draft").lower()
    invoice.amount_due = obj.get("amount_due") if obj.get("amount_due") is not None else invoice.amount_due
    invoice.amount_paid = obj.get("amount_paid") if obj.get("amount_paid") is not None else invoice.amount_paid
    invoice.amount_discount = sum(int(x.get("amount") or 0) for x in (obj.get("total_discount_amounts") or []))
    invoice.currency = (obj.get("currency") or invoice.currency or "brl").lower()
    invoice.due_at = _dt_from_unix(obj.get("due_date") or obj.get("created"))
    invoice.paid_at = _dt_from_unix((obj.get("status_transitions") or {}).get("paid_at")) or invoice.paid_at
    invoice.period_start = _dt_from_unix(obj.get("period_start")) or invoice.period_start
    invoice.period_end = _dt_from_unix(obj.get("period_end")) or invoice.period_end
    invoice.customer_name = profile.legal_name or invoice.customer_name
    invoice.customer_document = profile.cnpj_number or invoice.customer_document
    invoice.customer_email = profile.finance_email or profile.contact_email or invoice.customer_email
    invoice.hosted_invoice_url = obj.get("hosted_invoice_url") or invoice.hosted_invoice_url
    invoice.invoice_pdf_url = obj.get("invoice_pdf") or invoice.invoice_pdf_url
    invoice.metadata_json = {**(invoice.metadata_json or {}), "stripe_number": obj.get("number"), "stripe_status": obj.get("status")}

    if invoice.payment_status == "paid":
        invoice.fiscal_status = "ready_to_issue" if billing_profile_is_complete(profile) else "pending_profile"
    elif invoice.payment_status in {"void", "uncollectible", "canceled"}:
        invoice.fiscal_status = "canceled"
    else:
        invoice.fiscal_status = "pending_profile" if not billing_profile_is_complete(profile) else invoice.fiscal_status

    db.add(invoice)
    db.flush()
    return invoice


def issue_fiscal_invoice(
    db: Session,
    invoice: BillingInvoice,
    *,
    manual_number: str | None = None,
    verification_code: str | None = None,
    fiscal_pdf_url: str | None = None,
    fiscal_xml_url: str | None = None,
    notes: str | None = None,
) -> BillingInvoice:
    profile = get_or_create_billing_profile(db, invoice.tenant_id)
    cfg = get_platform_billing_config(db)
    invoice.issue_attempted_at = datetime.utcnow()
    invoice.issue_provider = cfg.provider_type

    missing = billing_profile_missing_fields(profile)
    if missing:
        invoice.fiscal_status = "pending_profile"
        invoice.error_message = f"Perfil de faturamento incompleto: {', '.join(missing)}"
        db.add(invoice)
        db.flush()
        return invoice

    if cfg.provider_type == "custom_webhook" and cfg.webhook_url:
        payload = {
            "invoice_id": str(invoice.id),
            "tenant_id": str(invoice.tenant_id),
            "customer": {
                "legal_name": profile.legal_name,
                "trade_name": profile.trade_name,
                "cnpj": profile.cnpj_number,
                "email": profile.finance_email or profile.contact_email,
                "address": {
                    "street": profile.address_street,
                    "number": profile.address_number,
                    "complement": profile.address_complement,
                    "district": profile.address_district,
                    "city": profile.city,
                    "state": profile.state,
                    "postal_code": profile.postal_code,
                    "country_code": profile.country_code,
                },
            },
            "invoice": {
                "amount_due": invoice.amount_due,
                "amount_paid": invoice.amount_paid,
                "currency": invoice.currency,
                "description": cfg.service_description or f"Assinatura SaaS {invoice.plan_key or ''}".strip(),
                "service_code": cfg.service_code,
                "source_invoice_id": invoice.source_invoice_id,
                "payment_status": invoice.payment_status,
            },
        }
        headers = {"Content-Type": "application/json"}
        if cfg.api_token:
            headers["Authorization"] = f"Bearer {cfg.api_token}"
        req = urllib_request.Request(cfg.webhook_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib_request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8") or "{}")
            invoice.external_invoice_id = data.get("external_id") or data.get("invoice_id") or invoice.external_invoice_id
            invoice.external_invoice_number = data.get("number") or data.get("nfse_number") or invoice.external_invoice_number
            invoice.verification_code = data.get("verification_code") or invoice.verification_code
            invoice.fiscal_pdf_url = data.get("pdf_url") or invoice.fiscal_pdf_url
            invoice.fiscal_xml_url = data.get("xml_url") or invoice.fiscal_xml_url
            invoice.fiscal_status = "issued"
            invoice.issued_at = datetime.utcnow()
            invoice.error_message = None
        except HTTPError as e:
            invoice.fiscal_status = "error"
            invoice.error_message = f"Webhook fiscal HTTP {e.code}"
        except URLError as e:
            invoice.fiscal_status = "error"
            invoice.error_message = f"Webhook fiscal indisponível: {e.reason}"
        except Exception as e:
            invoice.fiscal_status = "error"
            invoice.error_message = f"Falha ao emitir via webhook: {e}"
    elif cfg.provider_type == "manual":
        invoice.external_invoice_number = manual_number or invoice.external_invoice_number
        invoice.verification_code = verification_code or invoice.verification_code
        invoice.fiscal_pdf_url = fiscal_pdf_url or invoice.fiscal_pdf_url or invoice.invoice_pdf_url or invoice.hosted_invoice_url
        invoice.fiscal_xml_url = fiscal_xml_url or invoice.fiscal_xml_url
        invoice.fiscal_status = "issued" if invoice.external_invoice_number else "manual_review"
        invoice.issued_at = datetime.utcnow() if invoice.fiscal_status == "issued" else None
        invoice.error_message = None if invoice.fiscal_status == "issued" else "Aguardando complemento manual da NFS-e."
    else:
        invoice.fiscal_status = "manual_review"
        invoice.error_message = "Provider fiscal configurado, mas integração automática ainda não está operacional."

    if notes:
        invoice.metadata_json = {**(invoice.metadata_json or {}), "issue_notes": notes}

    db.add(invoice)
    db.flush()
    return invoice


def send_invoice_email(db: Session, invoice: BillingInvoice, recipient_email: str | None = None) -> bool:
    recipient = recipient_email or invoice.customer_email
    if not recipient:
        return False
    service = EmailService()
    ok = service.queue_billing_invoice(
        to_email=recipient,
        customer_name=invoice.customer_name or "Cliente",
        invoice_number=invoice.external_invoice_number or invoice.source_invoice_id or str(invoice.id),
        amount_cents=invoice.amount_paid or invoice.amount_due or 0,
        currency=invoice.currency or "brl",
        invoice_url=invoice.fiscal_pdf_url or invoice.invoice_pdf_url or invoice.hosted_invoice_url,
        payment_status=invoice.payment_status,
        fiscal_status=invoice.fiscal_status,
    )
    if ok:
        invoice.emailed_at = datetime.utcnow()
        invoice.email_last_recipient = recipient
        if invoice.fiscal_status == "issued":
            invoice.fiscal_status = "sent"
        db.add(invoice)
        db.flush()
    return ok
