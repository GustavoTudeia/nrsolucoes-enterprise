from __future__ import annotations
from sqlalchemy import Column, String, ForeignKey, JSON, DateTime, Float
from app.models.types import GUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin, VersionedMixin

class RiskCriterionVersion(Base, UUIDPrimaryKeyMixin, TimestampMixin, VersionedMixin):
    __tablename__ = "risk_criterion_version"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)  # null = plataforma
    name = Column(String(200), nullable=False)
    status = Column(String(30), nullable=False, default="published")  # draft|published|archived

    # content:
    # { "weights": {"workload":0.3,...}, "thresholds": {"low":0.45,"high":0.7} }
    content = Column(JSON, nullable=False, default=dict)

    published_at = Column(DateTime, nullable=True, default=datetime.utcnow)

class RiskAssessment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "risk_assessment"

    campaign_id = Column(GUID(), ForeignKey("campaign.id"), nullable=False, index=True)
    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=False, index=True)
    org_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True, index=True)

    criterion_version_id = Column(GUID(), ForeignKey("risk_criterion_version.id"), nullable=False, index=True)

    score = Column(Float, nullable=False)
    level = Column(String(20), nullable=False)  # low|medium|high

    # aggregated snapshot: {"workload":0.82, ...}
    dimension_scores = Column(JSON, nullable=False, default=dict)

    assessed_at = Column(DateTime, nullable=False, default=datetime.utcnow)
