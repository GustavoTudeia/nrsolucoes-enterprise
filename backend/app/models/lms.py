from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, String, ForeignKey, Boolean, DateTime, Integer, Index
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
from app.models.types import GUID


class ContentItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "content_item"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)  # null = plataforma
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    content_type = Column(String(30), nullable=False, default="video")  # video|pdf|link

    # Conteúdo externo
    url = Column(String(1000), nullable=True)

    # Conteúdo interno (upload)
    storage_key = Column(String(500), nullable=True)

    duration_minutes = Column(Integer, nullable=True)
    is_platform_managed = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class LearningPath(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "learning_path"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)  # null = plataforma
    title = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    is_platform_managed = Column(Boolean, default=False, nullable=False)

    items = relationship("LearningPathItem", back_populates="path", cascade="all, delete-orphan")


class LearningPathItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "learning_path_item"

    learning_path_id = Column(GUID(), ForeignKey("learning_path.id"), nullable=False, index=True)
    content_item_id = Column(GUID(), ForeignKey("content_item.id"), nullable=False, index=True)
    order_index = Column(Integer, nullable=False, default=0)

    path = relationship("LearningPath", back_populates="items")


class ContentAssignment(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "content_assignment"

    content_item_id = Column(GUID(), ForeignKey("content_item.id"), nullable=True, index=True)
    learning_path_id = Column(GUID(), ForeignKey("learning_path.id"), nullable=True, index=True)

    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=True, index=True)
    org_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True, index=True)

    due_at = Column(DateTime, nullable=True)
    status = Column(String(30), nullable=False, default="assigned")  # assigned|in_progress|completed


class ContentCompletion(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "content_completion"

    assignment_id = Column(GUID(), ForeignKey("content_assignment.id"), nullable=False, index=True)
    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=False, index=True)
    completed_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    completion_method = Column(String(30), nullable=False, default="manual")  # manual|watch_threshold


class ContentProgress(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "content_progress"

    assignment_id = Column(GUID(), ForeignKey("content_assignment.id"), nullable=False, index=True)
    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=False, index=True)

    position_seconds = Column(Integer, nullable=False, default=0)
    duration_seconds = Column(Integer, nullable=True)

    last_event_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    __table_args__ = (Index("ix_progress_unique", "tenant_id", "assignment_id", "employee_id", unique=True),)
