from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin
from app.models.types import GUID


class SSOLoginAttempt(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "sso_login_attempt"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, index=True)

    state = Column(String(120), nullable=False, unique=True, index=True)
    nonce = Column(String(120), nullable=False)
    redirect_uri = Column(String(500), nullable=False)

    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)

    tenant = relationship("Tenant")


Index("ix_sso_attempt_tenant_state", SSOLoginAttempt.tenant_id, SSOLoginAttempt.state)
