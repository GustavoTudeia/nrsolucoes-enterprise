from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_any_role, tenant_id_from_user, require_feature
from app.core.errors import Forbidden, NotFound
from app.core.rbac import ROLE_OWNER, ROLE_TENANT_ADMIN
from app.db.session import get_db
from app.models.tenant import TenantSettings, TenantSSOConfig
from app.schemas.settings import TenantSettingsOut, TenantSettingsUpdate
from app.schemas.sso import SSOConfigOut, SSOConfigUpdate

router = APIRouter(prefix="/settings")


def _get_or_create_settings(db: Session, tenant_id):
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    if not s:
        s = TenantSettings(tenant_id=tenant_id, min_anon_threshold=5)
        db.add(s)
        db.flush()
    return s


def _get_or_create_sso(db: Session, tenant_id):
    s = db.query(TenantSSOConfig).filter(TenantSSOConfig.tenant_id == tenant_id).first()
    if not s:
        s = TenantSSOConfig(tenant_id=tenant_id, enabled=False, issuer_url=None, client_id=None, client_secret=None, allowed_domains=None)
        db.add(s)
        db.flush()
    return s


@router.get("/tenant", response_model=TenantSettingsOut)
def get_tenant_settings(
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id=Depends(tenant_id_from_user),
):
    s = _get_or_create_settings(db, tenant_id)
    return TenantSettingsOut(
        min_anon_threshold=s.min_anon_threshold,
        brand_name=s.brand_name,
        logo_url=s.logo_url,
        primary_color=s.primary_color,
        secondary_color=s.secondary_color,
        support_email=s.support_email,
        custom_domain=s.custom_domain,
        login_background_url=s.login_background_url,
    )


@router.patch("/privacy", response_model=TenantSettingsOut)
def update_privacy_settings(
    payload: TenantSettingsUpdate,
    db: Session = Depends(get_db),
    _feat_ok: None = Depends(require_feature("ANONYMIZATION")),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id=Depends(tenant_id_from_user),
):
    s = _get_or_create_settings(db, tenant_id)
    if payload.min_anon_threshold is not None:
        s.min_anon_threshold = payload.min_anon_threshold
    db.add(s)
    db.commit()
    db.refresh(s)
    return TenantSettingsOut(
        min_anon_threshold=s.min_anon_threshold,
        brand_name=s.brand_name,
        logo_url=s.logo_url,
        primary_color=s.primary_color,
        secondary_color=s.secondary_color,
        support_email=s.support_email,
        custom_domain=s.custom_domain,
        login_background_url=s.login_background_url,
    )


@router.patch("/branding", response_model=TenantSettingsOut)
def update_branding_settings(
    payload: TenantSettingsUpdate,
    db: Session = Depends(get_db),
    _feat_ok: None = Depends(require_feature("WHITE_LABEL")),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id=Depends(tenant_id_from_user),
):
    s = _get_or_create_settings(db, tenant_id)
    for field in ["brand_name", "logo_url", "primary_color", "secondary_color", "support_email", "custom_domain", "login_background_url"]:
        val = getattr(payload, field)
        if val is not None:
            setattr(s, field, val)
    db.add(s)
    db.commit()
    db.refresh(s)
    return TenantSettingsOut(
        min_anon_threshold=s.min_anon_threshold,
        brand_name=s.brand_name,
        logo_url=s.logo_url,
        primary_color=s.primary_color,
        secondary_color=s.secondary_color,
        support_email=s.support_email,
        custom_domain=s.custom_domain,
        login_background_url=s.login_background_url,
    )


@router.get("/sso", response_model=SSOConfigOut)
def get_sso_config(
    db: Session = Depends(get_db),
    _feat_ok: None = Depends(require_feature("SSO_OIDC")),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id=Depends(tenant_id_from_user),
):
    s = _get_or_create_sso(db, tenant_id)
    domains = []
    if s.allowed_domains:
        domains = [d.strip() for d in s.allowed_domains.split(",") if d.strip()]
    return SSOConfigOut(
        enabled=s.enabled,
        issuer_url=s.issuer_url,
        client_id=s.client_id,
        allowed_domains=domains,
        has_client_secret=bool(s.client_secret),
    )


@router.patch("/sso", response_model=SSOConfigOut)
def update_sso_config(
    payload: SSOConfigUpdate,
    db: Session = Depends(get_db),
    _feat_ok: None = Depends(require_feature("SSO_OIDC")),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN])),
    tenant_id=Depends(tenant_id_from_user),
):
    s = _get_or_create_sso(db, tenant_id)
    if payload.enabled is not None:
        s.enabled = bool(payload.enabled)
    if payload.issuer_url is not None:
        s.issuer_url = payload.issuer_url
    if payload.client_id is not None:
        s.client_id = payload.client_id
    if payload.client_secret is not None:
        s.client_secret = payload.client_secret
    if payload.allowed_domains is not None:
        s.allowed_domains = ",".join([d.strip() for d in payload.allowed_domains if d and d.strip()]) or None

    db.add(s)
    db.commit()
    db.refresh(s)

    domains = []
    if s.allowed_domains:
        domains = [d.strip() for d in s.allowed_domains.split(",") if d.strip()]
    return SSOConfigOut(
        enabled=s.enabled,
        issuer_url=s.issuer_url,
        client_id=s.client_id,
        allowed_domains=domains,
        has_client_secret=bool(s.client_secret),
    )
