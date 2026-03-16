from __future__ import annotations

from sqlalchemy import Column, String, ForeignKey, DateTime, JSON, Integer, Text, Boolean
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin
from app.models.types import GUID
from app.models.mixins import utcnow


class AnalyticsEvent(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "analytics_event"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)
    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)
    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=True, index=True)

    event_name = Column(String(120), nullable=False, index=True)
    source = Column(String(20), nullable=False, default="backend", index=True)  # public|console|employee|backend|system
    actor_role = Column(String(80), nullable=True, index=True)
    module = Column(String(80), nullable=True, index=True)
    distinct_key = Column(String(160), nullable=True, index=True)

    path = Column(String(500), nullable=True)
    referrer = Column(String(1000), nullable=True)
    channel = Column(String(80), nullable=True, index=True)
    utm_source = Column(String(120), nullable=True, index=True)
    utm_medium = Column(String(120), nullable=True, index=True)
    utm_campaign = Column(String(160), nullable=True, index=True)
    utm_term = Column(String(160), nullable=True)
    utm_content = Column(String(160), nullable=True)

    event_properties = Column("properties", JSON, nullable=False, default=dict)
    occurred_at = Column(DateTime, nullable=False, default=utcnow, index=True)

    tenant = relationship("Tenant")
    user = relationship("User")
    employee = relationship("Employee")


class TenantHealthSnapshot(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_health_snapshot"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, unique=True, index=True)
    score = Column(Integer, nullable=False, default=0)
    band = Column(String(20), nullable=False, default="critical", index=True)  # healthy|attention|risk|critical
    activation_status = Column(String(30), nullable=False, default="not_started", index=True)  # not_started|in_progress|activated

    onboarding_score = Column(Integer, nullable=False, default=0)
    activation_score = Column(Integer, nullable=False, default=0)
    depth_score = Column(Integer, nullable=False, default=0)
    routine_score = Column(Integer, nullable=False, default=0)
    billing_score = Column(Integer, nullable=False, default=0)

    metrics_json = Column("metrics", JSON, nullable=False, default=dict)
    recommendations_json = Column("recommendations", JSON, nullable=False, default=list)
    risk_flags_json = Column("risk_flags", JSON, nullable=False, default=list)

    last_value_event_at = Column(DateTime, nullable=True)
    last_active_at = Column(DateTime, nullable=True)
    recomputed_at = Column(DateTime, nullable=False, default=utcnow)

    tenant = relationship("Tenant")


class TenantNudge(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_nudge"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)

    nudge_key = Column(String(120), nullable=False, index=True)
    channel = Column(String(30), nullable=False, default="in_app")  # in_app|email|workflow
    audience_role = Column(String(80), nullable=True, index=True)
    recipient_email = Column(String(200), nullable=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    status = Column(String(30), nullable=False, default="pending", index=True)  # pending|sent|dismissed|resolved|error
    send_email = Column(Boolean, nullable=False, default=False)
    due_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    context_json = Column("context", JSON, nullable=False, default=dict)

    tenant = relationship("Tenant")
    user = relationship("User")
