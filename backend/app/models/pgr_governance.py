from __future__ import annotations

from sqlalchemy import Column, String, ForeignKey, DateTime, Integer, JSON, Text
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
from app.models.types import GUID


class PGRDocumentApproval(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "pgr_document_approval"

    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=False, index=True)
    org_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True, index=True)
    approved_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False, index=True)
    superseded_by_id = Column(GUID(), ForeignKey("pgr_document_approval.id"), nullable=True, index=True)

    document_scope = Column(String(30), nullable=False, default="inventory")  # inventory|pgr
    version_label = Column(String(60), nullable=False)
    status = Column(String(20), nullable=False, default="active")  # active|superseded|revoked

    statement = Column(Text, nullable=False)
    notes = Column(Text, nullable=True)

    approver_name = Column(String(200), nullable=False)
    approver_role = Column(String(120), nullable=True)
    approver_email = Column(String(200), nullable=True)

    effective_from = Column(DateTime, nullable=False)
    review_due_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=False)

    inventory_item_count = Column(Integer, nullable=False, default=0)
    snapshot_hash = Column(String(128), nullable=False, index=True)
    snapshot_json = Column(JSON, nullable=False, default=dict)

    cnpj = relationship("CNPJ")
    org_unit = relationship("OrgUnit")
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])
    superseded_by = relationship("PGRDocumentApproval", remote_side="PGRDocumentApproval.id", foreign_keys=[superseded_by_id])


class ErgonomicAssessment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "ergonomic_assessment"

    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=False, index=True)
    org_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True, index=True)
    created_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)
    approved_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=True, index=True)

    assessment_type = Column(String(10), nullable=False, default="AEP")  # AEP|AET
    title = Column(String(200), nullable=False)
    status = Column(String(20), nullable=False, default="draft")  # draft|in_review|approved|archived

    process_name = Column(String(200), nullable=True)
    activity_name = Column(String(200), nullable=True)
    position_name = Column(String(200), nullable=True)
    workstation_name = Column(String(200), nullable=True)

    demand_summary = Column(Text, nullable=True)
    conditions_summary = Column(Text, nullable=True)
    psychosocial_factors = Column(JSON, nullable=False, default=list)
    findings = Column(JSON, nullable=False, default=list)
    recommendations = Column(JSON, nullable=False, default=list)
    traceability = Column(JSON, nullable=False, default=dict)

    reviewed_at = Column(DateTime, nullable=True)
    review_due_at = Column(DateTime, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approval_notes = Column(Text, nullable=True)

    cnpj = relationship("CNPJ")
    org_unit = relationship("OrgUnit")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])
