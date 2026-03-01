from __future__ import annotations
from datetime import datetime
from uuid import uuid4
from sqlalchemy import Column, DateTime
from app.models.types import GUID
from sqlalchemy.types import String
from sqlalchemy import Boolean, Integer, ForeignKey

def utcnow():
    return datetime.utcnow()

class UUIDPrimaryKeyMixin:
    id = Column(GUID(), primary_key=True, default=uuid4)

class TimestampMixin:
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

class VersionedMixin:
    version = Column(Integer, default=1, nullable=False)

class TenantScopedMixin:
    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, index=True)
