from __future__ import annotations

from sqlalchemy import Column, String, Boolean, Integer, ForeignKey
from app.models.types import GUID
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.models.mixins import UUIDPrimaryKeyMixin, TimestampMixin


class Tenant(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant"

    name = Column(String(200), nullable=False)
    slug = Column(String(80), unique=True, nullable=True, index=True)
    is_active = Column(Boolean, default=True, nullable=False)

    referred_by_affiliate_id = Column(GUID(), ForeignKey("affiliate.id"), nullable=True, index=True)

    settings = relationship("TenantSettings", uselist=False, back_populates="tenant", cascade="all, delete-orphan")
    subscription = relationship("TenantSubscription", uselist=False, back_populates="tenant", cascade="all, delete-orphan")
    sso = relationship("TenantSSOConfig", uselist=False, back_populates="tenant", cascade="all, delete-orphan")


class TenantSettings(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_settings"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, unique=True, index=True)
    min_anon_threshold = Column(Integer, nullable=False, default=5)

    # White-label / Branding
    brand_name = Column(String(200), nullable=True)
    logo_url = Column(String(1000), nullable=True)
    primary_color = Column(String(32), nullable=True)  # ex: #0f172a
    secondary_color = Column(String(32), nullable=True)
    support_email = Column(String(200), nullable=True)
    custom_domain = Column(String(200), nullable=True)
    login_background_url = Column(String(1000), nullable=True)

    tenant = relationship("Tenant", back_populates="settings")


class TenantSSOConfig(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "tenant_sso_config"

    tenant_id = Column(GUID(), ForeignKey("tenant.id"), nullable=False, unique=True, index=True)
    enabled = Column(Boolean, default=False, nullable=False)

    issuer_url = Column(String(400), nullable=True)
    client_id = Column(String(200), nullable=True)
    client_secret = Column(String(400), nullable=True)
    allowed_domains = Column(String(400), nullable=True)  # CSV (ex: empresa.com.br,subsidiaria.com)

    tenant = relationship("Tenant", back_populates="sso")
