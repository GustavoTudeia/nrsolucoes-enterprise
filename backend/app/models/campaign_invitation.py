"""Campaign Invitation Model."""
from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, DateTime, Index, Text, Integer
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
from app.models.types import GUID


class CampaignInvitation(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "campaign_invitation"

    campaign_id = Column(GUID(), ForeignKey("campaign.id"), nullable=False, index=True)
    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    status = Column(String(20), nullable=False, default="pending", index=True)

    expires_at = Column(DateTime, nullable=False)
    sent_at = Column(DateTime, nullable=True)
    opened_at = Column(DateTime, nullable=True)
    used_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    sent_via = Column(String(30), nullable=True)
    sent_to_email = Column(String(200), nullable=True)

    ip_opened = Column(String(45), nullable=True)
    ip_used = Column(String(45), nullable=True)
    user_agent_used = Column(String(500), nullable=True)

    reminder_count = Column(Integer, nullable=False, default=0)
    notes = Column(Text, nullable=True)

    campaign = relationship("Campaign", back_populates="invitations")
    employee = relationship("Employee")

    __table_args__ = (
        Index("uq_campaign_employee", "campaign_id", "employee_id", unique=True),
        Index("ix_campaign_invitation_campaign_status", "campaign_id", "status"),
        Index("ix_campaign_invitation_tenant_status", "tenant_id", "status"),
    )

    def is_valid(self) -> bool:
        if self.status != "pending":
            return False
        if self.expires_at and self.expires_at < datetime.utcnow():
            return False
        return True

    def mark_as_used(self, ip: str | None = None, user_agent: str | None = None) -> None:
        self.status = "used"
        self.used_at = datetime.utcnow()
        self.ip_used = ip
        self.user_agent_used = user_agent

    def mark_as_opened(self, ip: str | None = None) -> None:
        if not self.opened_at:
            self.opened_at = datetime.utcnow()
            self.ip_opened = ip

    def revoke(self, reason: str | None = None) -> None:
        self.status = "revoked"
        self.revoked_at = datetime.utcnow()
        if reason:
            self.notes = f"Revogado: {reason}"


class CampaignInvitationBatch(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "campaign_invitation_batch"

    campaign_id = Column(GUID(), ForeignKey("campaign.id"), nullable=False, index=True)
    created_by_user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False)

    filter_cnpj_id = Column(GUID(), nullable=True)
    filter_org_unit_id = Column(GUID(), nullable=True)
    filter_criteria = Column(Text, nullable=True)

    total_invited = Column(Integer, nullable=False, default=0)
    total_sent = Column(Integer, nullable=False, default=0)
    total_failed = Column(Integer, nullable=False, default=0)

    send_started_at = Column(DateTime, nullable=True)
    send_completed_at = Column(DateTime, nullable=True)
    send_status = Column(String(30), default="pending")

    campaign = relationship("Campaign")
    created_by = relationship("User")
