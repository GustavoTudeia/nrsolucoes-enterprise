from __future__ import annotations
from sqlalchemy import Column, String, Boolean, JSON, ForeignKey, Integer, DateTime
from app.models.types import GUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin, VersionedMixin

class QuestionnaireTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "questionnaire_template"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=True, index=True)  # null = plataforma
    key = Column(String(100), nullable=False)  # template key
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    is_platform_managed = Column(Boolean, default=False, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    versions = relationship("QuestionnaireVersion", back_populates="template", cascade="all, delete-orphan")

class QuestionnaireVersion(Base, UUIDPrimaryKeyMixin, TimestampMixin, VersionedMixin):
    __tablename__ = "questionnaire_version"

    template_id = Column(GUID(), ForeignKey("questionnaire_template.id"), nullable=False, index=True)
    status = Column(String(30), nullable=False, default="draft")  # draft|published|archived

    # content schema:
    # { "dimensions":[...], "questions":[{"id":"q1","dimension":"workload","text":"...","weight":1,"scale_min":1,"scale_max":5}, ...] }
    content = Column(JSON, nullable=False, default=dict)

    published_at = Column(DateTime, nullable=True)

    template = relationship("QuestionnaireTemplate", back_populates="versions")
