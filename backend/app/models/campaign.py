from __future__ import annotations
from sqlalchemy import Column, String, ForeignKey, DateTime, JSON, Boolean, Integer
from sqlalchemy.orm import relationship
from app.models.types import GUID
from datetime import datetime

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin


class Campaign(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "campaign"

    name = Column(String(200), nullable=False)
    questionnaire_version_id = Column(
        GUID(), ForeignKey("questionnaire_version.id"), nullable=False, index=True
    )
    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=False, index=True)
    org_unit_id = Column(
        GUID(), ForeignKey("org_unit.id"), nullable=True, index=True
    )  # setor/unidade (p/ análise segmentada)
    status = Column(String(30), nullable=False, default="draft")  # draft|open|closed

    # Convites controlados: enterprise = aberto OU tokenizado, nunca híbrido implícito
    require_invitation = Column(Boolean, nullable=False, default=False)
    invitation_expires_days = Column(Integer, nullable=False, default=30)

    opened_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    invitations = relationship(
        "CampaignInvitation", back_populates="campaign", cascade="all, delete-orphan"
    )


class SurveyResponse(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "survey_response"

    campaign_id = Column(GUID(), ForeignKey("campaign.id"), nullable=False, index=True)
    questionnaire_version_id = Column(
        GUID(), ForeignKey("questionnaire_version.id"), nullable=False, index=True
    )
    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=False, index=True)
    org_unit_id = Column(
        GUID(), ForeignKey("org_unit.id"), nullable=True, index=True
    )  # setor/unidade (p/ análise segmentada)

    # LGPD: resposta anônima (sem user_id/employee_id)
    answers = Column(JSON, nullable=False, default=dict)
    submitted_at = Column(DateTime, nullable=False, default=datetime.utcnow)
