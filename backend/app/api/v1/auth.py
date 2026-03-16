from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_request_meta, user_role_keys
from app.core.audit import make_audit_event
from app.core.config import settings
from app.core.errors import BadRequest, NotFound, Unauthorized
from app.core.rate_limit import enforce_rate_limit
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.auth_audit_log import AuthAuditLog
from app.models.auth_token import AuthToken
from app.models.legal import PasswordResetToken
from app.models.tenant import Tenant
from app.models.user import Role, User, UserRoleScope
from app.schemas.auth import (
    LoginCPFRequest,
    LoginRequest,
    LoginResponse,
    OTPRequestPayload,
    OTPRequestResponse,
    OTPVerifyPayload,
    PasswordChangeRequest,
    PasswordResetConfirmOut,
    PasswordResetConfirmRequest,
    PasswordResetStartOut,
    PasswordResetStartRequest,
    RefreshTokenRequest,
    SelectTenantRequest,
    TenantInfo,
    TokenPair,
    UserMe,
)
from app.services.email_service import email_service
from app.services.refresh_tokens import issue_token_pair, revoke_refresh_token, rotate_refresh_token

router = APIRouter(prefix="/auth")


def _sha256(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()



def _normalize_cpf(cpf: str) -> str:
    return re.sub(r"[^\d]", "", cpf)



def _mask_phone(phone: str | None) -> str:
    digits = re.sub(r"[^\d]", "", phone or "")
    if len(digits) >= 10:
        return f"({digits[:2]}) {digits[2]}****-{digits[-4:]}"
    return "(**) *****-****"



def _get_user_tenants(db: Session, user: User) -> List[TenantInfo]:
    roles = (
        db.query(UserRoleScope)
        .filter(UserRoleScope.user_id == user.id, UserRoleScope.is_active == True)
        .all()
    )
    tenant_map: dict[UUID, TenantInfo] = {}
    for rs in roles:
        if rs.tenant_id and rs.tenant_id not in tenant_map:
            tenant = db.query(Tenant).filter(Tenant.id == rs.tenant_id).first()
            role = db.query(Role).filter(Role.id == rs.role_id).first()
            if tenant and role:
                tenant_map[rs.tenant_id] = TenantInfo(
                    id=tenant.id,
                    name=tenant.name,
                    role_key=role.key,
                    role_name=role.name,
                )
    return list(tenant_map.values())



def _issue_tokens(db: Session, user: User, tenant_id: Optional[UUID], meta: dict) -> tuple[str, str]:
    return issue_token_pair(
        db,
        user=user,
        tenant_id=tenant_id,
        ip_address=meta.get("ip"),
        user_agent=meta.get("user_agent"),
    )



def _user_me(user: User, tenant_id: UUID | None) -> UserMe:
    return UserMe(
        id=user.id,
        email=user.email,
        cpf=user.cpf,
        full_name=user.full_name,
        phone=user.phone,
        tenant_id=tenant_id,
        is_platform_admin=user.is_platform_admin,
        must_change_password=user.must_change_password,
        roles=user_role_keys(user),
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    email = payload.email.lower().strip()
    enforce_rate_limit(
        scope="auth:login",
        identifier=f"{meta.get('ip', '-')}:email:{email}",
        limit=settings.AUTH_RATE_LIMIT_LOGIN,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.email == email).first()
    if not user:
        db.add(AuthAuditLog.log_login_failed("USER_NOT_FOUND", email=email, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Credenciais inválidas")
    if not user.is_active:
        db.add(AuthAuditLog.log_login_failed("ACCOUNT_INACTIVE", email=email, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Conta desativada")
    if user.is_locked:
        db.add(AuthAuditLog.log_login_failed("ACCOUNT_LOCKED", email=email, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Conta bloqueada. Tente novamente mais tarde.")
    if not verify_password(payload.password, user.password_hash):
        user.increment_failed_login()
        db.add(user)
        db.add(AuthAuditLog.log_login_failed("INVALID_PASSWORD", email=email, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Credenciais inválidas")

    user.record_login()
    tenants = _get_user_tenants(db, user)
    current_tenant_id = user.tenant_id or (tenants[0].id if tenants else None)
    access_token, refresh_token = _issue_tokens(db, user, current_tenant_id, meta)
    db.add(user)
    db.add(AuthAuditLog.log_login_success(user.id, current_tenant_id, ip=meta.get("ip"), user_agent=meta.get("user_agent"), email=email))
    db.add(make_audit_event(tenant_id=current_tenant_id, actor_user_id=user.id, action="LOGIN", entity_type="USER", entity_id=user.id, before=None, after={"email": user.email}, ip=meta.get("ip"), user_agent=meta.get("user_agent"), request_id=meta.get("request_id")))
    db.commit()
    return LoginResponse(access_token=access_token, refresh_token=refresh_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, user=_user_me(user, current_tenant_id), tenants=tenants, current_tenant_id=current_tenant_id)


@router.post("/login/cpf", response_model=LoginResponse)
def login_cpf(payload: LoginCPFRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    cpf = _normalize_cpf(payload.cpf)
    enforce_rate_limit(
        scope="auth:login-cpf",
        identifier=f"{meta.get('ip', '-')}:cpf:{cpf}",
        limit=settings.AUTH_RATE_LIMIT_LOGIN,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.cpf == cpf).first()
    if not user:
        db.add(AuthAuditLog.log_login_failed("USER_NOT_FOUND", cpf=cpf, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Credenciais inválidas")
    if not user.is_active:
        db.add(AuthAuditLog.log_login_failed("ACCOUNT_INACTIVE", cpf=cpf, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Conta desativada")
    if user.is_locked:
        db.add(AuthAuditLog.log_login_failed("ACCOUNT_LOCKED", cpf=cpf, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Conta bloqueada. Tente novamente mais tarde.")
    if not verify_password(payload.password, user.password_hash):
        user.increment_failed_login()
        db.add(user)
        db.add(AuthAuditLog.log_login_failed("INVALID_PASSWORD", cpf=cpf, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Credenciais inválidas")

    user.record_login()
    tenants = _get_user_tenants(db, user)
    current_tenant_id = user.tenant_id or (tenants[0].id if tenants else None)
    access_token, refresh_token = _issue_tokens(db, user, current_tenant_id, meta)
    db.add(user)
    db.add(AuthAuditLog.log_login_success(user.id, current_tenant_id, ip=meta.get("ip"), user_agent=meta.get("user_agent"), cpf=cpf))
    db.commit()
    return LoginResponse(access_token=access_token, refresh_token=refresh_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, user=_user_me(user, current_tenant_id), tenants=tenants, current_tenant_id=current_tenant_id)


@router.post("/login/otp/request", response_model=OTPRequestResponse)
def request_otp(payload: OTPRequestPayload, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    cpf = _normalize_cpf(payload.cpf)
    enforce_rate_limit(
        scope="auth:otp-request",
        identifier=f"{meta.get('ip', '-')}:cpf:{cpf}",
        limit=settings.AUTH_RATE_LIMIT_OTP_REQUEST,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.cpf == cpf, User.is_active == True).first()
    if not user or not user.phone:
        return OTPRequestResponse(message="Se o CPF estiver cadastrado, enviaremos o código.", masked_phone="(**) *****-****", expires_in=300)

    otp_code = AuthToken.generate_otp()
    auth_token = AuthToken(
        token_type="otp",
        token_hash=AuthToken.hash_token(secrets.token_urlsafe(16)),
        user_id=user.id,
        phone=user.phone,
        otp_code=otp_code,
        expires_at=AuthToken.expires_in_minutes(5),
        ip_address=meta.get("ip"),
        user_agent=meta.get("user_agent"),
    )
    db.add(auth_token)
    db.add(AuthAuditLog.log_otp_sent(user.phone, payload.method, user_id=user.id))
    db.commit()
    if user.email:
        email_service.queue_otp_code(to_email=user.email, code=otp_code, user_name=user.full_name or user.email)
    return OTPRequestResponse(message="Código enviado!", masked_phone=_mask_phone(user.phone), expires_in=300)


@router.post("/login/otp/verify", response_model=LoginResponse)
def verify_otp(payload: OTPVerifyPayload, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    cpf = _normalize_cpf(payload.cpf)
    enforce_rate_limit(
        scope="auth:otp-verify",
        identifier=f"{meta.get('ip', '-')}:cpf:{cpf}",
        limit=settings.AUTH_RATE_LIMIT_OTP_VERIFY,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.cpf == cpf).first()
    if not user:
        raise Unauthorized("Código inválido ou expirado")
    auth_token = (
        db.query(AuthToken)
        .filter(
            AuthToken.user_id == user.id,
            AuthToken.token_type == "otp",
            AuthToken.otp_code == payload.code,
            AuthToken.used_at == None,
            AuthToken.expires_at > datetime.utcnow(),
        )
        .order_by(AuthToken.created_at.desc())
        .first()
    )
    if not auth_token:
        user.increment_failed_login()
        db.add(user)
        db.add(AuthAuditLog.log_login_failed("INVALID_OTP", cpf=cpf, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        raise Unauthorized("Código inválido ou expirado")

    auth_token.mark_used()
    user.record_login()
    tenants = _get_user_tenants(db, user)
    current_tenant_id = user.tenant_id or (tenants[0].id if tenants else None)
    access_token, refresh_token = _issue_tokens(db, user, current_tenant_id, meta)
    db.add(auth_token)
    db.add(user)
    db.add(AuthAuditLog.log_login_success(user.id, current_tenant_id, ip=meta.get("ip"), user_agent=meta.get("user_agent"), cpf=cpf))
    db.commit()
    return LoginResponse(access_token=access_token, refresh_token=refresh_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, user=_user_me(user, current_tenant_id), tenants=tenants, current_tenant_id=current_tenant_id)


@router.post("/select-tenant", response_model=LoginResponse)
def select_tenant(payload: SelectTenantRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user), meta: dict = Depends(get_request_meta)):
    role_scope = (
        db.query(UserRoleScope)
        .filter(UserRoleScope.user_id == user.id, UserRoleScope.tenant_id == payload.tenant_id, UserRoleScope.is_active == True)
        .first()
    )
    if not role_scope and not user.is_platform_admin:
        raise Unauthorized("Você não tem acesso a esta empresa")
    tenant = db.query(Tenant).filter(Tenant.id == payload.tenant_id).first()
    if not tenant:
        raise NotFound("Empresa não encontrada")
    tenants = _get_user_tenants(db, user)
    access_token, refresh_token = _issue_tokens(db, user, payload.tenant_id, meta)
    db.commit()
    return LoginResponse(access_token=access_token, refresh_token=refresh_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60, user=_user_me(user, payload.tenant_id), tenants=tenants, current_tenant_id=payload.tenant_id)


@router.post("/refresh", response_model=TokenPair)
def refresh_tokens(payload: RefreshTokenRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    enforce_rate_limit(
        scope="auth:refresh",
        identifier=f"{meta.get('ip', '-')}:rt:{payload.refresh_token[:12]}",
        limit=settings.AUTH_RATE_LIMIT_LOGIN * 3,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    _user, _tenant_id, access_token, refresh_token = rotate_refresh_token(
        db,
        raw_refresh_token=payload.refresh_token,
        ip_address=meta.get("ip"),
        user_agent=meta.get("user_agent"),
    )
    db.commit()
    return TokenPair(access_token=access_token, refresh_token=refresh_token, expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60)


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tenant_info = None
    if user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant:
            tenant_info = {"id": str(tenant.id), "name": tenant.name, "slug": tenant.slug}
    return {
        "id": user.id,
        "email": user.email,
        "cpf": user.cpf,
        "full_name": user.full_name,
        "phone": user.phone,
        "tenant_id": user.tenant_id,
        "tenant": tenant_info,
        "is_platform_admin": user.is_platform_admin,
        "must_change_password": user.must_change_password,
        "roles": user_role_keys(user),
        "created_at": user.created_at,
        "last_login_at": user.last_login_at,
    }


@router.post("/logout")
def logout(request: Request, db: Session = Depends(get_db), user: User = Depends(get_current_user), meta: dict = Depends(get_request_meta)):
    raw_refresh = request.headers.get("X-Refresh-Token")
    if raw_refresh:
        revoke_refresh_token(db, raw_refresh)
    db.add(AuthAuditLog.log_logout(user.id, user.tenant_id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
    db.commit()
    return {"message": "Logout realizado"}


@router.post("/password/change")
def change_password(payload: PasswordChangeRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user), meta: dict = Depends(get_request_meta)):
    if not verify_password(payload.current_password, user.password_hash):
        raise BadRequest("Senha atual incorreta")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.utcnow()
    db.add(user)
    db.add(AuthAuditLog.log_password_changed(user.id, user.tenant_id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
    db.add(make_audit_event(tenant_id=user.tenant_id, actor_user_id=user.id, action="PASSWORD_CHANGE", entity_type="USER", entity_id=user.id, before=None, after=None, ip=meta.get("ip"), user_agent=meta.get("user_agent"), request_id=meta.get("request_id")))
    db.commit()
    return {"message": "Senha alterada com sucesso"}


@router.post("/password-reset/start", response_model=PasswordResetStartOut)
def password_reset_start(payload: PasswordResetStartRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    email = payload.email.lower().strip()
    enforce_rate_limit(
        scope="auth:password-reset",
        identifier=f"{meta.get('ip', '-')}:email:{email}",
        limit=settings.AUTH_RATE_LIMIT_PASSWORD_RESET,
        window_seconds=settings.AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    raw: str | None = None
    if user:
        raw = secrets.token_urlsafe(32)
        rec = PasswordResetToken(
            tenant_id=user.tenant_id,
            user_id=user.id,
            token_hash=_sha256(raw),
            expires_at=datetime.utcnow() + timedelta(minutes=int(settings.PASSWORD_RESET_TOKEN_TTL_MINUTES or 30)),
            consumed_at=None,
            requested_ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
        db.add(rec)
        db.add(AuthAuditLog.log_password_reset_request(email=email, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.add(make_audit_event(tenant_id=user.tenant_id, actor_user_id=user.id, action="PASSWORD_RESET_REQUEST", entity_type="USER", entity_id=user.id, before=None, after={"email": user.email}, ip=meta.get("ip"), user_agent=meta.get("user_agent"), request_id=meta.get("request_id")))
        db.commit()
        reset_url = f"{settings.FRONTEND_URL}/recuperar-senha?token={raw}"
        email_service.queue_password_reset(to_email=user.email, reset_url=reset_url, user_name=user.full_name)
    return PasswordResetStartOut(status="ok", dev_token=(raw if settings.DEV_RETURN_PASSWORD_RESET_TOKEN else None))


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmOut)
def password_reset_confirm(payload: PasswordResetConfirmRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    rec = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == _sha256(payload.token)).first()
    if not rec or rec.consumed_at is not None or rec.expires_at < datetime.utcnow():
        raise BadRequest("Token inválido ou expirado")
    user = db.query(User).filter(User.id == rec.user_id).first()
    if not user or not user.is_active:
        raise BadRequest("Usuário inválido")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.utcnow()
    rec.consumed_at = datetime.utcnow()
    db.add(user)
    db.add(rec)
    db.add(AuthAuditLog.log_password_changed(user.id, user.tenant_id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
    db.add(make_audit_event(tenant_id=user.tenant_id, actor_user_id=user.id, action="PASSWORD_RESET_CONFIRM", entity_type="USER", entity_id=user.id, before=None, after={"email": user.email}, ip=meta.get("ip"), user_agent=meta.get("user_agent"), request_id=meta.get("request_id")))
    db.commit()
    return PasswordResetConfirmOut(status="ok")
