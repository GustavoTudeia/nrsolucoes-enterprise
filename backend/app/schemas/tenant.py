from __future__ import annotations
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

class TenantCreate(BaseModel):
    name: str
    slug: str | None = None

class TenantOut(BaseModel):
    id: UUID
    name: str
    slug: str | None = None
    is_active: bool
    plan_key: str | None = None
    plan_name: str | None = None
    subscription_status: str | None = None

class TenantSettingsOut(BaseModel):
    tenant_id: UUID
    min_anon_threshold: int
