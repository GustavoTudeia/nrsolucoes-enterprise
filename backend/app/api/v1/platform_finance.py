from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_platform_admin
from app.core.errors import NotFound, BadRequest
from app.db.session import get_db
from app.models.billing import BillingInvoice
from app.models.tenant import Tenant
from app.schemas.finance import PlatformBillingConfigIn, PlatformBillingConfigOut, BillingInvoiceAdminOut, FinanceOverviewOut
from app.services.finance_service import get_platform_billing_config, issue_fiscal_invoice, send_invoice_email

router = APIRouter(prefix="/platform/finance")


@router.get("/overview", response_model=FinanceOverviewOut)
def finance_overview(db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    rows = db.query(BillingInvoice.payment_status, func.count(BillingInvoice.id)).group_by(BillingInvoice.payment_status).all()
    frows = db.query(BillingInvoice.fiscal_status, func.count(BillingInvoice.id)).group_by(BillingInvoice.fiscal_status).all()
    by_payment = {k: v for k, v in rows}
    by_fiscal = {k: v for k, v in frows}
    revenue_paid = db.query(func.coalesce(func.sum(BillingInvoice.amount_paid), 0)).filter(BillingInvoice.payment_status == "paid").scalar() or 0
    revenue_open = db.query(func.coalesce(func.sum(BillingInvoice.amount_due), 0)).filter(BillingInvoice.payment_status.in_(["open", "draft", "past_due"])) .scalar() or 0
    total = db.query(func.count(BillingInvoice.id)).scalar() or 0
    return FinanceOverviewOut(total_invoices=int(total), paid_invoices=int(by_payment.get("paid", 0)), ready_to_issue=int(by_fiscal.get("ready_to_issue", 0)), overdue_invoices=int(by_payment.get("past_due", 0)), revenue_paid_cents=int(revenue_paid), revenue_open_cents=int(revenue_open), by_payment_status={str(k): int(v) for k, v in by_payment.items()}, by_fiscal_status={str(k): int(v) for k, v in by_fiscal.items()})


@router.get("/provider", response_model=PlatformBillingConfigOut)
def get_provider_config(db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    cfg = get_platform_billing_config(db)
    db.commit()
    return PlatformBillingConfigOut(id=cfg.id, key=cfg.key, is_active=cfg.is_active, provider_type=cfg.provider_type, provider_environment=cfg.provider_environment, issuer_legal_name=cfg.issuer_legal_name, issuer_document=cfg.issuer_document, issuer_municipal_registration=cfg.issuer_municipal_registration, issuer_email=cfg.issuer_email, service_code=cfg.service_code, service_description=cfg.service_description, api_base_url=cfg.api_base_url, api_token=cfg.api_token, webhook_url=cfg.webhook_url, webhook_secret=cfg.webhook_secret, auto_issue_on_payment=cfg.auto_issue_on_payment, auto_email_invoice=cfg.auto_email_invoice, send_boleto_pdf=cfg.send_boleto_pdf, created_at=cfg.created_at, updated_at=cfg.updated_at)


@router.put("/provider", response_model=PlatformBillingConfigOut)
def update_provider_config(payload: PlatformBillingConfigIn, db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    cfg = get_platform_billing_config(db)
    for field in payload.model_fields:
        setattr(cfg, field, getattr(payload, field))
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return PlatformBillingConfigOut(id=cfg.id, key=cfg.key, is_active=cfg.is_active, provider_type=cfg.provider_type, provider_environment=cfg.provider_environment, issuer_legal_name=cfg.issuer_legal_name, issuer_document=cfg.issuer_document, issuer_municipal_registration=cfg.issuer_municipal_registration, issuer_email=cfg.issuer_email, service_code=cfg.service_code, service_description=cfg.service_description, api_base_url=cfg.api_base_url, api_token=cfg.api_token, webhook_url=cfg.webhook_url, webhook_secret=cfg.webhook_secret, auto_issue_on_payment=cfg.auto_issue_on_payment, auto_email_invoice=cfg.auto_email_invoice, send_boleto_pdf=cfg.send_boleto_pdf, created_at=cfg.created_at, updated_at=cfg.updated_at)


@router.get("/invoices", response_model=list[BillingInvoiceAdminOut])
def list_platform_invoices(q: Optional[str] = Query(default=None), payment_status: Optional[str] = Query(default=None), fiscal_status: Optional[str] = Query(default=None), db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    query = db.query(BillingInvoice, Tenant).join(Tenant, Tenant.id == BillingInvoice.tenant_id)
    if q:
        like = f"%{q}%"
        query = query.filter((Tenant.name.ilike(like)) | (BillingInvoice.customer_name.ilike(like)))
    if payment_status:
        query = query.filter(BillingInvoice.payment_status == payment_status)
    if fiscal_status:
        query = query.filter(BillingInvoice.fiscal_status == fiscal_status)
    rows = query.order_by(BillingInvoice.created_at.desc()).limit(200).all()
    return [BillingInvoiceAdminOut(id=inv.id, tenant_id=inv.tenant_id, tenant_name=tenant.name, customer_name=inv.customer_name, customer_document=inv.customer_document, payment_status=inv.payment_status, fiscal_status=inv.fiscal_status, amount_due=inv.amount_due, amount_paid=inv.amount_paid, currency=inv.currency, due_at=inv.due_at, paid_at=inv.paid_at, external_invoice_number=inv.external_invoice_number, hosted_invoice_url=inv.hosted_invoice_url, invoice_pdf_url=inv.invoice_pdf_url, fiscal_pdf_url=inv.fiscal_pdf_url, emailed_at=inv.emailed_at, created_at=inv.created_at, updated_at=inv.updated_at) for inv, tenant in rows]


@router.post("/invoices/{invoice_id}/issue", response_model=dict)
def issue_platform_invoice(invoice_id: UUID, manual_number: Optional[str] = Query(default=None), verification_code: Optional[str] = Query(default=None), fiscal_pdf_url: Optional[str] = Query(default=None), fiscal_xml_url: Optional[str] = Query(default=None), notes: Optional[str] = Query(default=None), db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    invoice = db.query(BillingInvoice).filter(BillingInvoice.id == invoice_id).first()
    if not invoice:
        raise NotFound("Fatura não encontrada")
    if invoice.payment_status != "paid":
        raise BadRequest("Somente faturas pagas podem seguir para emissão fiscal")
    issue_fiscal_invoice(db, invoice, manual_number=manual_number, verification_code=verification_code, fiscal_pdf_url=fiscal_pdf_url, fiscal_xml_url=fiscal_xml_url, notes=notes)
    db.commit()
    return {"ok": True, "fiscal_status": invoice.fiscal_status, "number": invoice.external_invoice_number}


@router.post("/invoices/{invoice_id}/send", response_model=dict)
def send_platform_invoice(invoice_id: UUID, recipient_email: Optional[str] = Query(default=None), db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    invoice = db.query(BillingInvoice).filter(BillingInvoice.id == invoice_id).first()
    if not invoice:
        raise NotFound("Fatura não encontrada")
    ok = send_invoice_email(db, invoice, recipient_email)
    db.commit()
    return {"ok": bool(ok), "emailed_at": invoice.emailed_at.isoformat() if invoice.emailed_at else None}
