from __future__ import annotations
from pydantic import BaseModel
from uuid import UUID
from typing import Optional, List

class LedgerOut(BaseModel):
    id: UUID
    affiliate_id: UUID
    tenant_id: UUID
    provider_invoice_id: str
    net_amount: float
    commission_amount: float
    status: str

class PayoutCreate(BaseModel):
    amount: float
    method: str = "manual"
    reference: str | None = None

class PayoutOut(BaseModel):
    id: UUID
    affiliate_id: UUID
    amount: float
    currency: str
    status: str
    method: str
    reference: str | None = None
