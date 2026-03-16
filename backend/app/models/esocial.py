from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, String, ForeignKey, DateTime, JSON, Boolean
from app.models.types import GUID

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin


class ESocialS2240Profile(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "esocial_s2240_profile"

    cnpj_id = Column(GUID(), ForeignKey("cnpj.id"), nullable=False, index=True)
    org_unit_id = Column(GUID(), ForeignKey("org_unit.id"), nullable=True, index=True)

    role_name = Column(String(200), nullable=False)  # Função/cargo (para vincular exposição)
    environment_code = Column(String(50), nullable=True)  # codAmb (quando aplicável)
    activity_description = Column(String(500), nullable=True)

    # Lista de fatores de risco (assistido): [{"code":"ERGON","name":"Ergonômico","details":"..."}]
    factors = Column(JSON, nullable=False, default=list)

    # Controles/medidas (assistido): {"epc":[...], "epi":[...], "other":"..."}
    controls = Column(JSON, nullable=False, default=dict)

    valid_from = Column(DateTime, nullable=True)
    valid_to = Column(DateTime, nullable=True)
    layout_version = Column(String(20), nullable=False, default="S-1.3")
    source_reference = Column(String(120), nullable=True)
    traceability = Column(JSON, nullable=False, default=dict)

    is_active = Column(Boolean, default=True, nullable=False)


class ESocialS2210Accident(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "esocial_s2210_accident"

    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=False, index=True)
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    accident_type = Column(String(50), nullable=True)  # typical|commute|occupational_disease|other
    description = Column(String(1000), nullable=True)
    location = Column(String(200), nullable=True)
    cat_number = Column(String(60), nullable=True)
    layout_version = Column(String(20), nullable=False, default="S-1.3")
    source_reference = Column(String(120), nullable=True)
    traceability = Column(JSON, nullable=False, default=dict)

    payload = Column(JSON, nullable=False, default=dict)


class ESocialS2220Exam(Base, UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin):
    __tablename__ = "esocial_s2220_exam"

    employee_id = Column(GUID(), ForeignKey("employee.id"), nullable=False, index=True)
    exam_date = Column(DateTime, nullable=False, default=datetime.utcnow)

    exam_type = Column(String(80), nullable=True)  # admission|periodic|return|change|dismissal|other
    result = Column(String(200), nullable=True)
    layout_version = Column(String(20), nullable=False, default="S-1.3")
    source_reference = Column(String(120), nullable=True)
    traceability = Column(JSON, nullable=False, default=dict)

    payload = Column(JSON, nullable=False, default=dict)
