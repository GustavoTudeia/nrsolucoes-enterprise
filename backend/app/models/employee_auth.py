from __future__ import annotations

from datetime import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin
from app.models.types import GUID


class EmployeeMagicLinkToken(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "employee_magic_link_token"

    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)


class EmployeeOtpToken(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "employee_otp_token"

    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=False, index=True)
    employee_identifier = Column(String(200), nullable=False, index=True)  # redundância controlada p/ auditoria/debug
    code_hash = Column(String(128), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    attempts = Column(Integer, nullable=False, default=0)
    consumed_at = Column(DateTime, nullable=True)
