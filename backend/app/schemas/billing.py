from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field, EmailStr
from uuid import UUID
from typing import Dict, Any, Optional, List


class PlanOut(BaseModel):
    id: UUID
    key: str
    name: str
    features: Dict[str, Any]
    limits: Dict[str, Any]
    price_monthly: Optional[int] = None
    price_annual: Optional[int] = None
    is_custom_price: bool = False
    stripe_price_id_monthly: Optional[str] = None
    stripe_price_id_annual: Optional[str] = None


class SubscriptionOut(BaseModel):
    status: str
    plan_id: Optional[UUID] = None
    provider: Optional[str] = None
    current_period_end: Optional[datetime] = None
    billing_cycle: Optional[str] = None
    entitlements_snapshot: Optional[Dict[str, Any]] = None


class CheckoutSessionOut(BaseModel):
    checkout_url: str


class PortalSessionOut(BaseModel):
    url: str


class InvoiceOut(BaseModel):
    id: str
    number: Optional[str] = None
    status: Optional[str] = None
    currency: Optional[str] = None
    amount_due: Optional[int] = None
    amount_paid: Optional[int] = None
    created: Optional[int] = None
    hosted_invoice_url: Optional[str] = None
    invoice_pdf: Optional[str] = None
    fiscal_status: Optional[str] = None
    external_invoice_number: Optional[str] = None
    fiscal_pdf_url: Optional[str] = None
    emailed_at: Optional[datetime] = None


class BillingProfileIn(BaseModel):
    legal_name: str = Field(..., min_length=2, max_length=200)
    trade_name: Optional[str] = Field(default=None, max_length=200)
    cnpj_number: str = Field(..., min_length=14, max_length=20)
    state_registration: Optional[str] = Field(default=None, max_length=50)
    municipal_registration: Optional[str] = Field(default=None, max_length=50)
    tax_regime: Optional[str] = Field(default=None, max_length=50)
    contact_name: Optional[str] = Field(default=None, max_length=200)
    contact_email: Optional[EmailStr] = None
    finance_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = Field(default=None, max_length=30)
    address_street: Optional[str] = Field(default=None, max_length=255)
    address_number: Optional[str] = Field(default=None, max_length=50)
    address_complement: Optional[str] = Field(default=None, max_length=100)
    address_district: Optional[str] = Field(default=None, max_length=100)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, min_length=2, max_length=2)
    postal_code: Optional[str] = Field(default=None, max_length=20)
    country_code: str = Field(default="BR", min_length=2, max_length=2)
    notes: Optional[str] = None


class BillingProfileOut(BillingProfileIn):
    id: UUID
    tenant_id: UUID
    is_complete: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BillingProfileStatusOut(BaseModel):
    is_complete: bool
    missing_fields: List[str]


class OnboardingStepOut(BaseModel):
    key: str
    title: str
    description: str
    status: str
    href: str


class OnboardingOverviewOut(BaseModel):
    status: str
    progress_percent: int
    current_step: Optional[str] = None
    steps: List[OnboardingStepOut]
    metrics: Dict[str, int] = Field(default_factory=dict)
