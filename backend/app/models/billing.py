from __future__ import annotations
from sqlalchemy import Column, String, Boolean, Integer, JSON, DateTime, ForeignKey
from app.models.types import GUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin

class Plan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan"

    key = Column(String(50), unique=True, nullable=False)  # START, PRO, ENTERPRISE, SST
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    # entitlements (produto)
    features = Column(JSON, nullable=False, default=dict)
    limits = Column(JSON, nullable=False, default=dict)

    # pricing (centavos BRL)
    price_monthly = Column(Integer, nullable=True)   # ex: 29900 = R$299,00
    price_annual = Column(Integer, nullable=True)     # ex: 299900 = R$2.999,00
    is_custom_price = Column(Boolean, default=False, nullable=False)  # "Sob consulta"

    # provider mapping
    stripe_price_id = Column(String(200), nullable=True)

class TenantSubscription(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_subscription"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, unique=True, index=True)
    plan_id = Column(GUID(), nullable=True)

    status = Column(String(30), nullable=False, default="trial")  # trial|active|past_due|suspended|canceled
    provider = Column(String(30), nullable=False, default="stripe")

    provider_customer_id = Column(String(200), nullable=True)
    provider_subscription_id = Column(String(200), nullable=True)

    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)

    entitlements_snapshot = Column(JSON, nullable=False, default=dict)

    tenant = relationship("Tenant", back_populates="subscription")
