from __future__ import annotations

from sqlalchemy import Column, String, ForeignKey, UniqueConstraint, Boolean
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
from app.models.types import GUID


class CNPJ(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "cnpj"
    __table_args__ = (UniqueConstraint("tenant_id", "cnpj_number", name="uq_tenant_cnpj_number"),)

    legal_name = Column(String(200), nullable=False)
    trade_name = Column(String(200), nullable=True)
    cnpj_number = Column(String(20), nullable=False)  # dígitos (sem máscara)
    is_active = Column(Boolean, default=True, nullable=False)

    units = relationship("OrgUnit", back_populates="cnpj", cascade="all, delete-orphan")


class OrgUnit(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "org_unit"
    __table_args__ = (UniqueConstraint("tenant_id", "cnpj_id", "name", name="uq_unit_name_per_cnpj"),)

    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    unit_type = Column(String(50), nullable=False, default="unit")  # unit|sector
    parent_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)

    cnpj = relationship("CNPJ", back_populates="units")
