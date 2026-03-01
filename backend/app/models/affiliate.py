from __future__ import annotations

from sqlalchemy import Column, String, Boolean, DateTime, Float, ForeignKey, JSON, Integer, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin
from app.models.types import GUID


class Affiliate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "affiliate"
    __table_args__ = (UniqueConstraint("code", name="uq_affiliate_code"),)

    # "code" usado no link: ?ref=<code>
    code = Column(String(40), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True, index=True)
    document = Column(String(30), nullable=True)  # CPF/CNPJ (opcional no MVP)
    status = Column(String(20), nullable=False, default="active")  # active|suspended

    discount_percent = Column(Float, nullable=False, default=5.0)     # desconto para indicado
    commission_percent = Column(Float, nullable=False, default=10.0)  # comissão do afiliado

    # Stripe discount plumbing (opcional)
    stripe_coupon_id = Column(String(200), nullable=True)
    stripe_promotion_code_id = Column(String(200), nullable=True)

    notes = Column(String(500), nullable=True)


class ReferralAttribution(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "referral_attribution"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_referral_per_tenant"),)

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, index=True)
    affiliate_id = Column(GUID(), ForeignKey("affiliate.id"), nullable=False, index=True)

    first_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_seen_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    locked_at = Column(DateTime, nullable=True)

    status = Column(String(20), nullable=False, default="clicked")  # clicked|signed_up|paid|invalid

    meta = Column(JSON, nullable=False, default=dict)


class CommissionLedger(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "commission_ledger"
    __table_args__ = (UniqueConstraint("provider_invoice_id", name="uq_commission_invoice"),)

    affiliate_id = Column(GUID(), ForeignKey("affiliate.id"), nullable=False, index=True)
    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, index=True)

    provider_invoice_id = Column(String(200), nullable=False, index=True)
    provider_subscription_id = Column(String(200), nullable=True, index=True)

    currency = Column(String(10), nullable=False, default="brl")
    gross_amount = Column(Float, nullable=False, default=0.0)    # antes de desconto (estimado)
    discount_amount = Column(Float, nullable=False, default=0.0)
    net_amount = Column(Float, nullable=False, default=0.0)      # pago
    commission_amount = Column(Float, nullable=False, default=0.0)

    status = Column(String(20), nullable=False, default="pending")  # pending|available|paid|reversed
    available_at = Column(DateTime, nullable=True)


class Payout(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "affiliate_payout"

    affiliate_id = Column(GUID(), ForeignKey("affiliate.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="brl")
    status = Column(String(20), nullable=False, default="initiated")  # initiated|paid|failed
    method = Column(String(30), nullable=False, default="manual")     # manual|stripe_connect
    reference = Column(String(500), nullable=True)
    paid_at = Column(DateTime, nullable=True)
