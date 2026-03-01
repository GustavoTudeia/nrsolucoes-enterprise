from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel
from uuid import UUID
from typing import Dict, Any, Optional, List


class PlanOut(BaseModel):
    id: UUID
    key: str
    name: str
    features: Dict[str, Any]
    limits: Dict[str, Any]


class SubscriptionOut(BaseModel):
    status: str
    plan_id: Optional[UUID] = None
    provider: Optional[str] = None
    current_period_end: Optional[datetime] = None
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
