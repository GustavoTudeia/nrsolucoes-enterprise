from __future__ import annotations
from sqlalchemy import Column, String, JSON, DateTime
from app.models.types import GUID

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin

class AuditEvent(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "audit_event"

    tenant_id = Column(GUID(), nullable=True, index=True)
    actor_user_id = Column(GUID(), nullable=True, index=True)

    action = Column(String(30), nullable=False)  # CREATE|UPDATE|DELETE|EXPORT|LOGIN
    entity_type = Column(String(60), nullable=False)
    entity_id = Column(GUID(), nullable=True, index=True)

    before_json = Column(JSON, nullable=True)
    after_json = Column(JSON, nullable=True)

    ip = Column(String(64), nullable=True)
    user_agent = Column(String(300), nullable=True)
    request_id = Column(String(64), nullable=True)

    created_at = Column(DateTime, nullable=False)
