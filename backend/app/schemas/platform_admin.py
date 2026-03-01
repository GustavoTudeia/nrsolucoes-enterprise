from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Any, Dict, Optional


class PlanAdminOut(BaseModel):
    id: UUID
    key: str
    name: str
    features: Dict[str, Any]
    limits: Dict[str, Any]
    stripe_price_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TenantPlanChangeIn(BaseModel):
    plan_key: str = Field(..., min_length=2, max_length=64)
    status: str = Field(default="active", max_length=32)
