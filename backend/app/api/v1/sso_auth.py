from __future__ import annotations

import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, Unauthorized
from app.db.session import get_db
from app.models.sso import SSOLoginAttempt
from app.models.tenant import Tenant, TenantSSOConfig
from app.models.user import User
from app.schemas.sso import SSOStartRequest, SSOStartOut, SSOCallbackRequest, SSOCallbackOut
from app.services.oidc import get_discovery, build_authorization_url, exchange_code_for_tokens, verify_id_token

router = APIRouter(prefix="/auth/sso/oidc")


def _email_domain(email: str) -> str:
    email = (email or "").strip().lower()
    if "@" not in email:
        return ""
    return email.split("@", 1)[1].strip()


def _find_tenant_by_domain(db: Session, domain: str) -> tuple[Tenant, TenantSSOConfig] | None:
    if not domain:
        return None
    cfgs = db.query(TenantSSOConfig).filter(TenantSSOConfig.enabled == True).all()
    for cfg in cfgs:
        if not cfg.allowed_domains:
            continue
        domains = [d.strip().lower() for d in cfg.allowed_domains.split(",") if d.strip()]
        if domain.lower() in domains:
            tenant = db.query(Tenant).filter(Tenant.id == cfg.tenant_id, Tenant.is_active == True).first()
            if tenant:
                return tenant, cfg
    return None


@router.post("/start", response_model=SSOStartOut)
def start_oidc(payload: SSOStartRequest, db: Session = Depends(get_db)):
    domain = _email_domain(payload.email)
    found = _find_tenant_by_domain(db, domain)
    if not found:
        raise BadRequest("SSO não configurado para este domínio")
    tenant, cfg = found
    if not cfg.issuer_url or not cfg.client_id:
        raise BadRequest("SSO incompleto (issuer/client_id)")
    if not cfg.client_secret:
        raise BadRequest("SSO incompleto (client_secret)")

    discovery = get_discovery(cfg.issuer_url)
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(24)

    attempt = SSOLoginAttempt(
        tenant_id=tenant.id,
        state=state,
        nonce=nonce,
        redirect_uri=payload.redirect_uri,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
        used_at=None,
    )
    db.add(attempt)
    db.commit()

    auth_url = build_authorization_url(discovery, cfg.client_id, payload.redirect_uri, state, nonce)
    return SSOStartOut(authorization_url=auth_url, state=state)


@router.post("/callback", response_model=SSOCallbackOut)
def callback_oidc(payload: SSOCallbackRequest, db: Session = Depends(get_db)):
    attempt = db.query(SSOLoginAttempt).filter(SSOLoginAttempt.state == payload.state).first()
    if not attempt or attempt.used_at is not None or attempt.expires_at < datetime.utcnow():
        raise BadRequest("State inválido ou expirado")

    if attempt.redirect_uri != payload.redirect_uri:
        raise BadRequest("redirect_uri não confere")

    cfg = db.query(TenantSSOConfig).filter(TenantSSOConfig.tenant_id == attempt.tenant_id, TenantSSOConfig.enabled == True).first()
    if not cfg or not cfg.issuer_url or not cfg.client_id or not cfg.client_secret:
        raise BadRequest("SSO não configurado para o tenant")

    discovery = get_discovery(cfg.issuer_url)
    tokens = exchange_code_for_tokens(discovery, cfg.client_id, cfg.client_secret, payload.code, payload.redirect_uri)

    id_token = tokens.get("id_token")
    if not id_token:
        raise BadRequest("Resposta do IdP sem id_token")

    claims = verify_id_token(discovery, id_token, cfg.client_id, cfg.issuer_url)
    email = (claims.get("email") or claims.get("preferred_username") or "").strip().lower()
    if not email:
        raise Unauthorized("IdP não retornou claim de email")

    user = db.query(User).filter(User.email == email, User.tenant_id == attempt.tenant_id, User.is_active == True).first()
    if not user:
        raise Unauthorized("Usuário não provisionado para este tenant")

    access_token = create_access_token(
        subject=user.email,
        extra={"uid": str(user.id), "tid": str(user.tenant_id) if user.tenant_id else None, "pla": user.is_platform_admin},
    )

    attempt.used_at = datetime.utcnow()
    db.add(attempt)
    db.add(
        make_audit_event(
            tenant_id=user.tenant_id,
            actor_user_id=user.id,
            action="LOGIN_SSO",
            entity_type="USER",
            entity_id=user.id,
            before=None,
            after={"email": user.email},
            ip=None,
            user_agent=None,
            request_id=None,
        )
    )
    db.commit()

    return SSOCallbackOut(access_token=access_token)
