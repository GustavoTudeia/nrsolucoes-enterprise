from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin
from app.models.types import GUID


class LegalAcceptance(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "legal_acceptance"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)
    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False, index=True)

    terms_version = Column(String(40), nullable=False)
    privacy_version = Column(String(40), nullable=False)

    accepted_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    ip = Column(String(80), nullable=True)
    user_agent = Column(String(400), nullable=True)

    user = relationship("User")


Index("ix_legal_acceptance_user_versions", LegalAcceptance.user_id, LegalAcceptance.terms_version, LegalAcceptance.privacy_version, unique=True)


class PasswordResetToken(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "password_reset_token"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)
    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False, index=True)

    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)

    requested_ip = Column(String(80), nullable=True)
    user_agent = Column(String(400), nullable=True)

    user = relationship("User")
