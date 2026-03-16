from __future__ import annotations

from sqlalchemy import (
    Column,
    String,
    Boolean,
    Integer,
    JSON,
    DateTime,
    ForeignKey,
    Text,
    UniqueConstraint,
)
from app.models.types import GUID
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin


class Plan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan"

    key = Column(String(50), unique=True, nullable=False)  # START, PRO, ENTERPRISE, SST
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)

    features = Column(JSON, nullable=False, default=dict)
    limits = Column(JSON, nullable=False, default=dict)

    price_monthly = Column(Integer, nullable=True)
    price_annual = Column(Integer, nullable=True)
    is_custom_price = Column(Boolean, default=False, nullable=False)

    stripe_price_id = Column(String(200), nullable=True)  # legado/fallback
    stripe_price_id_monthly = Column(String(200), nullable=True)
    stripe_price_id_annual = Column(String(200), nullable=True)


class TenantSubscription(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_subscription"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, unique=True, index=True)
    plan_id = Column(GUID(), ForeignKey("plan.id"), nullable=True)

    status = Column(String(30), nullable=False, default="trial")
    provider = Column(String(30), nullable=False, default="stripe")

    provider_customer_id = Column(String(200), nullable=True)
    provider_subscription_id = Column(String(200), nullable=True)

    current_period_start = Column(DateTime, nullable=True)
    current_period_end = Column(DateTime, nullable=True)
    trial_ends_at = Column(DateTime, nullable=True)
    billing_cycle = Column(String(20), nullable=True, default="monthly")

    entitlements_snapshot = Column(JSON, nullable=False, default=dict)

    tenant = relationship("Tenant", back_populates="subscription")
    plan = relationship("Plan")
    invoices = relationship("BillingInvoice", back_populates="subscription", cascade="all, delete-orphan")


class BillingProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "billing_profile"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, unique=True, index=True)

    legal_name = Column(String(200), nullable=True)
    trade_name = Column(String(200), nullable=True)
    cnpj_number = Column(String(20), nullable=True)
    state_registration = Column(String(50), nullable=True)
    municipal_registration = Column(String(50), nullable=True)
    tax_regime = Column(String(50), nullable=True)

    contact_name = Column(String(200), nullable=True)
    contact_email = Column(String(200), nullable=True)
    finance_email = Column(String(200), nullable=True)
    contact_phone = Column(String(30), nullable=True)

    address_street = Column(String(255), nullable=True)
    address_number = Column(String(50), nullable=True)
    address_complement = Column(String(100), nullable=True)
    address_district = Column(String(100), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(2), nullable=True)
    postal_code = Column(String(20), nullable=True)
    country_code = Column(String(2), nullable=False, default="BR")

    notes = Column(Text, nullable=True)
    metadata_json = Column("metadata", JSON, nullable=False, default=dict)

    tenant = relationship("Tenant")


class BillingInvoice(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "billing_invoice"
    __table_args__ = (
        UniqueConstraint("source_provider", "source_invoice_id", name="uq_billing_invoice_source"),
    )

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, index=True)
    subscription_id = Column(GUID(), ForeignKey("tenant_subscription.id"), nullable=True, index=True)

    source_provider = Column(String(30), nullable=False, default="stripe")
    source_invoice_id = Column(String(200), nullable=True, index=True)
    source_subscription_id = Column(String(200), nullable=True, index=True)

    plan_key = Column(String(50), nullable=True)
    billing_cycle = Column(String(20), nullable=True)
    currency = Column(String(10), nullable=False, default="brl")

    payment_status = Column(String(30), nullable=False, default="draft")
    fiscal_status = Column(String(30), nullable=False, default="pending_profile")

    amount_due = Column(Integer, nullable=True)
    amount_paid = Column(Integer, nullable=True)
    amount_discount = Column(Integer, nullable=True)
    amount_tax = Column(Integer, nullable=True)

    due_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)

    customer_name = Column(String(200), nullable=True)
    customer_document = Column(String(30), nullable=True)
    customer_email = Column(String(200), nullable=True)

    hosted_invoice_url = Column(String(1000), nullable=True)
    invoice_pdf_url = Column(String(1000), nullable=True)

    issue_provider = Column(String(50), nullable=True)
    external_invoice_number = Column(String(100), nullable=True)
    external_invoice_id = Column(String(200), nullable=True)
    verification_code = Column(String(100), nullable=True)
    fiscal_pdf_url = Column(String(1000), nullable=True)
    fiscal_xml_url = Column(String(1000), nullable=True)

    issue_attempted_at = Column(DateTime, nullable=True)
    issued_at = Column(DateTime, nullable=True)
    emailed_at = Column(DateTime, nullable=True)
    email_last_recipient = Column(String(200), nullable=True)

    error_message = Column(Text, nullable=True)
    line_items = Column(JSON, nullable=False, default=list)
    metadata_json = Column("metadata", JSON, nullable=False, default=dict)

    tenant = relationship("Tenant")
    subscription = relationship("TenantSubscription", back_populates="invoices")


class PlatformBillingConfig(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "platform_billing_config"

    key = Column(String(50), nullable=False, unique=True, default="default")
    is_active = Column(Boolean, nullable=False, default=True)

    provider_type = Column(String(50), nullable=False, default="manual")  # manual|custom_webhook|nfse_nacional
    provider_environment = Column(String(20), nullable=False, default="sandbox")

    issuer_legal_name = Column(String(200), nullable=True)
    issuer_document = Column(String(30), nullable=True)
    issuer_municipal_registration = Column(String(50), nullable=True)
    issuer_email = Column(String(200), nullable=True)

    service_code = Column(String(50), nullable=True)
    service_description = Column(String(255), nullable=True)

    api_base_url = Column(String(500), nullable=True)
    api_token = Column(String(500), nullable=True)
    webhook_url = Column(String(500), nullable=True)
    webhook_secret = Column(String(500), nullable=True)

    auto_issue_on_payment = Column(Boolean, nullable=False, default=False)
    auto_email_invoice = Column(Boolean, nullable=False, default=True)
    send_boleto_pdf = Column(Boolean, nullable=False, default=True)

    metadata_json = Column("metadata", JSON, nullable=False, default=dict)


class TenantOnboarding(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_onboarding"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, unique=True, index=True)
    status = Column(String(30), nullable=False, default="in_progress")
    current_step = Column(String(50), nullable=True, default="billing_profile")

    plan_selected_at = Column(DateTime, nullable=True)
    payment_confirmed_at = Column(DateTime, nullable=True)
    billing_profile_completed_at = Column(DateTime, nullable=True)
    org_structure_completed_at = Column(DateTime, nullable=True)
    first_user_completed_at = Column(DateTime, nullable=True)
    first_campaign_completed_at = Column(DateTime, nullable=True)
    first_response_completed_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    notes = Column(Text, nullable=True)
    metadata_json = Column("metadata", JSON, nullable=False, default=dict)

    tenant = relationship("Tenant")
