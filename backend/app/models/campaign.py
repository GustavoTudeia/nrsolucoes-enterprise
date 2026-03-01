from __future__ import annotations
from sqlalchemy import Column, String, ForeignKey, DateTime, JSON
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

    # Configuração de convites
    require_invitation = Column(
        String(5), nullable=False, default="true"
    )  # Se true, exige token para responder
    invitation_expires_days = Column(
        String(5), nullable=False, default="30"
    )  # Dias até expirar convite

    opened_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)

    # Relacionamentos
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
