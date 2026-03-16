from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field, EmailStr
from typing import Dict, Optional
from uuid import UUID


class PlatformBillingConfigIn(BaseModel):
    provider_type: str = Field(default="manual", pattern=r"^(manual|custom_webhook|nfse_nacional)$")
    provider_environment: str = Field(default="sandbox", pattern=r"^(sandbox|production)$")
    issuer_legal_name: Optional[str] = None
    issuer_document: Optional[str] = None
    issuer_municipal_registration: Optional[str] = None
    issuer_email: Optional[EmailStr] = None
    service_code: Optional[str] = None
    service_description: Optional[str] = None
    api_base_url: Optional[str] = None
    api_token: Optional[str] = None
    webhook_url: Optional[str] = None
    webhook_secret: Optional[str] = None
    auto_issue_on_payment: bool = False
    auto_email_invoice: bool = True
    send_boleto_pdf: bool = True


class PlatformBillingConfigOut(PlatformBillingConfigIn):
    id: UUID
    key: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class BillingInvoiceAdminOut(BaseModel):
    id: UUID
    tenant_id: UUID
    tenant_name: str
    customer_name: Optional[str] = None
    customer_document: Optional[str] = None
    payment_status: str
    fiscal_status: str
    amount_due: Optional[int] = None
    amount_paid: Optional[int] = None
    currency: str
    due_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    external_invoice_number: Optional[str] = None
    hosted_invoice_url: Optional[str] = None
    invoice_pdf_url: Optional[str] = None
    fiscal_pdf_url: Optional[str] = None
    emailed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class FinanceOverviewOut(BaseModel):
    total_invoices: int
    paid_invoices: int
    ready_to_issue: int
    overdue_invoices: int
    revenue_paid_cents: int
    revenue_open_cents: int
    by_payment_status: Dict[str, int]
    by_fiscal_status: Dict[str, int]
