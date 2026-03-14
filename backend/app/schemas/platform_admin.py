from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Any, Dict, List, Optional


class PlanAdminOut(BaseModel):
    id: UUID
    key: str
    name: str
    features: Dict[str, Any]
    limits: Dict[str, Any]
    price_monthly: Optional[int] = None
    price_annual: Optional[int] = None
    is_custom_price: bool = False
    stripe_price_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PlanCreateIn(BaseModel):
    key: str = Field(..., min_length=2, max_length=50)
    name: str = Field(..., min_length=2, max_length=100)
    features: Dict[str, Any] = Field(default_factory=dict)
    limits: Dict[str, Any] = Field(default_factory=dict)
    price_monthly: Optional[int] = None
    price_annual: Optional[int] = None
    is_custom_price: bool = False
    stripe_price_id: Optional[str] = None
    is_active: bool = True


class PlanUpdateIn(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    features: Optional[Dict[str, Any]] = None
    limits: Optional[Dict[str, Any]] = None
    price_monthly: Optional[int] = None
    price_annual: Optional[int] = None
    is_custom_price: Optional[bool] = None
    stripe_price_id: Optional[str] = None
    is_active: Optional[bool] = None


class TenantPlanChangeIn(BaseModel):
    plan_key: str = Field(..., min_length=2, max_length=64)
    status: str = Field(default="active", max_length=32)


# ── Subscription Admin ────────────────────────────────────────────────────────

class SubscriptionAdminOut(BaseModel):
    id: UUID
    tenant_id: UUID
    tenant_name: str
    plan_key: Optional[str] = None
    plan_name: Optional[str] = None
    status: str
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class SubscriptionStatusChangeIn(BaseModel):
    status: str = Field(..., pattern=r"^(active|suspended|canceled)$")


class SubscriptionStatsOut(BaseModel):
    total: int
    by_status: Dict[str, int]
    active_count: int
