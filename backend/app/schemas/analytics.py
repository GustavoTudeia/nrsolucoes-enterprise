from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field

from app.schemas.common import Page


class BrowserAnalyticsEventIn(BaseModel):
    event_name: str = Field(min_length=2, max_length=120)
    source: str = Field(default="public", max_length=20)
    module: Optional[str] = Field(default=None, max_length=80)
    distinct_key: Optional[str] = Field(default=None, max_length=160)
    path: Optional[str] = Field(default=None, max_length=500)
    referrer: Optional[str] = Field(default=None, max_length=1000)
    channel: Optional[str] = Field(default=None, max_length=80)
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_term: Optional[str] = None
    utm_content: Optional[str] = None
    properties: dict[str, Any] = Field(default_factory=dict)


class AnalyticsTrackOut(BaseModel):
    ok: bool = True
    event_name: str
    occurred_at: datetime


class TenantRecommendationOut(BaseModel):
    key: str
    severity: str
    title: str
    body: str
    cta_label: Optional[str] = None
    cta_href: Optional[str] = None
    audience_role: Optional[str] = None


class TenantHealthOut(BaseModel):
    tenant_id: str
    score: int
    band: str
    activation_status: str
    onboarding_score: int
    activation_score: int
    depth_score: int
    routine_score: int
    billing_score: int
    last_value_event_at: Optional[datetime] = None
    last_active_at: Optional[datetime] = None
    recomputed_at: Optional[datetime] = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    risk_flags: list[str] = Field(default_factory=list)
    recommendations: list[TenantRecommendationOut] = Field(default_factory=list)


class TenantNudgeOut(BaseModel):
    id: str
    nudge_key: str
    channel: str
    audience_role: Optional[str] = None
    title: str
    body: str
    status: str
    send_email: bool = False
    due_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    context: dict[str, Any] = Field(default_factory=dict)


class PlatformAnalyticsOverviewOut(BaseModel):
    total_tenants: int
    activated_tenants: int
    healthy_tenants: int
    attention_tenants: int
    risk_tenants: int
    critical_tenants: int
    average_health_score: float
    onboarding_completion_rate: float
    activation_rate: float
    payment_risk_tenants: int
    last_30d_value_events: int


class PlatformTenantHealthItemOut(BaseModel):
    tenant_id: str
    tenant_name: str
    tenant_slug: Optional[str] = None
    plan_key: Optional[str] = None
    billing_status: Optional[str] = None
    score: int
    band: str
    activation_status: str
    last_active_at: Optional[datetime] = None
    last_value_event_at: Optional[datetime] = None
    metrics: dict[str, Any] = Field(default_factory=dict)
    risk_flags: list[str] = Field(default_factory=list)


class PlatformTenantHealthPageOut(Page[PlatformTenantHealthItemOut]):
    pass


class WorkflowRunOut(BaseModel):
    ok: bool = True
    processed_tenants: int
    nudges_generated: int
    nudges_sent: int
