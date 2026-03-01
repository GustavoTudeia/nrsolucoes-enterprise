from __future__ import annotations

from sqlalchemy import Column, String, Boolean, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin
from app.models.types import GUID


class TemplatePack(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "template_pack"
    __table_args__ = (UniqueConstraint("key", name="uq_template_pack_key"),)

    key = Column(String(100), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    items = relationship("TemplatePackItem", back_populates="pack", cascade="all, delete-orphan")


class TemplatePackItem(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "template_pack_item"

    pack_id = Column(GUID(), ForeignKey("template_pack.id"), nullable=False, index=True)
    item_type = Column(String(50), nullable=False)  # questionnaire_template|content_item|learning_path
    item_id = Column(GUID(), nullable=False, index=True)
    order_index = Column(Integer, nullable=False, default=0)

    pack = relationship("TemplatePack", back_populates="items")
