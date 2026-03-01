from __future__ import annotations
from pydantic import BaseModel, EmailStr
from uuid import UUID
from typing import Optional

class AffiliateCreate(BaseModel):
    code: str
    name: str
    email: Optional[EmailStr] = None
    document: Optional[str] = None
    discount_percent: float = 5.0
    commission_percent: float = 10.0

class AffiliateOut(BaseModel):
    id: UUID
    code: str
    name: str
    email: Optional[EmailStr] = None
    status: str
    discount_percent: float
    commission_percent: float

class AffiliatePublicOut(BaseModel):
    affiliate_code: str
    discount_percent: float
