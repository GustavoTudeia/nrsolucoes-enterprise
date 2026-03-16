from __future__ import annotations

from sqlalchemy import Column, String, ForeignKey, DateTime, Integer, JSON, Boolean, UniqueConstraint, Text
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
from app.models.types import GUID


class HazardCatalogItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "hazard_catalog_item"
    __table_args__ = (UniqueConstraint("code", name="uq_hazard_catalog_item_code"),)

    code = Column(String(50), nullable=False, index=True)
    hazard_group = Column(String(30), nullable=False, index=True)  # physical|chemical|biological|ergonomic|accident|psychosocial
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    legal_basis = Column(String(100), nullable=True)  # ex: NR-1, NR-17
    control_suggestions = Column(JSON, nullable=False, default=list)
    default_evidence_requirements = Column(JSON, nullable=False, default=list)
    is_active = Column(Boolean, nullable=False, default=True)


class RiskInventoryItem(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "risk_inventory_item"

    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=False, index=True)
    org_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True, index=True)
    catalog_item_id = Column(GUID(), ForeignKey("hazard_catalog_item.id"), nullable=True, index=True)
    created_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)
    approved_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)

    process_name = Column(String(200), nullable=False)
    activity_name = Column(String(200), nullable=False)
    position_name = Column(String(200), nullable=True)
    hazard_group = Column(String(30), nullable=False, index=True)
    hazard_name = Column(String(200), nullable=False)
    source_or_circumstance = Column(Text, nullable=True)
    possible_damage = Column(Text, nullable=True)
    exposed_workers = Column(Integer, nullable=False, default=0)
    exposure_notes = Column(Text, nullable=True)

    existing_controls = Column(JSON, nullable=False, default=list)
    proposed_controls = Column(JSON, nullable=False, default=list)
    evidence_requirements = Column(JSON, nullable=False, default=list)
    traceability = Column(JSON, nullable=False, default=dict)

    severity = Column(Integer, nullable=False, default=1)
    probability = Column(Integer, nullable=False, default=1)
    risk_score = Column(Integer, nullable=False, default=1)
    risk_level = Column(String(20), nullable=False, default="low")

    residual_severity = Column(Integer, nullable=True)
    residual_probability = Column(Integer, nullable=True)
    residual_risk_score = Column(Integer, nullable=True)
    residual_risk_level = Column(String(20), nullable=True)

    status = Column(String(30), nullable=False, default="draft")  # draft|approved|archived
    reviewed_at = Column(DateTime, nullable=True)
    review_due_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_notes = Column(Text, nullable=True)

    catalog_item = relationship("HazardCatalogItem")
    cnpj = relationship("CNPJ")
    org_unit = relationship("OrgUnit")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])
