from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin
from app.models.types import GUID


class RefreshSession(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "auth_refresh_session"

    user_id = Column(GUID(), ForeignKey("user_account.id"), nullable=False, index=True)
    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)
    family_id = Column(GUID(), nullable=False, default=uuid4, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    replaced_by_token_hash = Column(String(128), nullable=True, index=True)

    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)

    expires_at = Column(DateTime, nullable=False, index=True)
    last_used_at = Column(DateTime, nullable=True)
    rotated_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    tenant = relationship("Tenant", foreign_keys=[tenant_id])

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_expired(self) -> bool:
        return datetime.utcnow() >= self.expires_at

    @property
    def is_rotated(self) -> bool:
        return self.rotated_at is not None
