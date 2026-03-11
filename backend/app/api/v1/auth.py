from __future__ import annotations

import hashlib
import secrets
import re
from datetime import datetime, timedelta
from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.api.deps import get_current_user, user_role_keys, get_request_meta
from app.core.audit import make_audit_event
from app.core.config import settings
from app.core.errors import Unauthorized, BadRequest, NotFound
from app.core.security import verify_password, create_access_token, hash_password
from app.db.session import get_db
from app.models.legal import PasswordResetToken
from app.models.user import User, Role, UserRoleScope
from app.models.tenant import Tenant
from app.models.auth_token import AuthToken
from app.models.auth_audit_log import AuthAuditLog
from app.services.email_service import email_service
from app.schemas.auth import (
    LoginRequest,
    LoginCPFRequest,
    Token,
    TokenPair,
    UserMe,
    TenantInfo,
    LoginResponse,
    RefreshTokenRequest,
    PasswordResetStartRequest,
    PasswordResetStartOut,
    PasswordResetConfirmRequest,
    PasswordResetConfirmOut,
    PasswordChangeRequest,
    SelectTenantRequest,
    OTPRequestPayload,
    OTPRequestResponse,
    OTPVerifyPayload,
)

router = APIRouter(prefix="/auth")


def _sha256(x: str) -> str:
    return hashlib.sha256(x.encode("utf-8")).hexdigest()


def _normalize_cpf(cpf: str) -> str:
    """Remove formatação do CPF."""
    return re.sub(r"[^\d]", "", cpf)


def _mask_phone(phone: str) -> str:
    """Mascara telefone para exibição: (11) 9****-7890"""
    digits = re.sub(r"[^\d]", "", phone)
    if len(digits) >= 10:
        return f"({digits[:2]}) {digits[2]}****-{digits[-4:]}"
    return phone[:3] + "****" + phone[-3:]


def _get_user_tenants(db: Session, user: User) -> List[TenantInfo]:
    """Retorna lista de tenants que o usuário tem acesso."""
    roles = (
        db.query(UserRoleScope)
        .filter(UserRoleScope.user_id == user.id, UserRoleScope.is_active == True)
        .all()
    )

    tenant_map = {}
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


def _create_tokens(user: User, tenant_id: Optional[UUID] = None) -> tuple:
    """Cria par de tokens (access + refresh)."""
    access_token = create_access_token(
        subject=user.email or user.cpf,
        extra={
            "uid": str(user.id),
            "tid": (
                str(tenant_id)
                if tenant_id
                else (str(user.tenant_id) if user.tenant_id else None)
            ),
            "pla": user.is_platform_admin,
        },
    )
    refresh_token = secrets.token_urlsafe(48)
    return access_token, refresh_token


# ==============================================================================
# LOGIN POR EMAIL
# ==============================================================================


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """Login por email e senha."""
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()

    if not user:
        db.add(
            AuthAuditLog.log_login_failed(
                "USER_NOT_FOUND",
                email=email,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Credenciais inválidas")

    if not user.is_active:
        db.add(
            AuthAuditLog.log_login_failed(
                "ACCOUNT_INACTIVE",
                email=email,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Conta desativada")

    if user.is_locked:
        db.add(
            AuthAuditLog.log_login_failed(
                "ACCOUNT_LOCKED",
                email=email,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Conta bloqueada. Tente novamente mais tarde.")

    if not verify_password(payload.password, user.password_hash):
        user.increment_failed_login()
        db.add(
            AuthAuditLog.log_login_failed(
                "INVALID_PASSWORD",
                email=email,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Credenciais inválidas")

    # Login bem-sucedido
    user.record_login()
    tenants = _get_user_tenants(db, user)
    current_tenant_id = user.tenant_id or (tenants[0].id if tenants else None)

    access_token, refresh_token = _create_tokens(user, current_tenant_id)

    db.add(
        AuthAuditLog.log_login_success(
            user.id,
            current_tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            email=email,
        )
    )
    db.add(
        make_audit_event(
            tenant_id=current_tenant_id,
            actor_user_id=user.id,
            action="LOGIN",
            entity_type="USER",
            entity_id=user.id,
            before=None,
            after={"email": user.email},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
        user=UserMe(
            id=user.id,
            email=user.email,
            cpf=user.cpf,
            full_name=user.full_name,
            phone=user.phone,
            tenant_id=current_tenant_id,
            is_platform_admin=user.is_platform_admin,
            must_change_password=user.must_change_password,
            roles=user_role_keys(user),
        ),
        tenants=tenants,
        current_tenant_id=current_tenant_id,
    )


# ==============================================================================
# LOGIN POR CPF
# ==============================================================================


@router.post("/login/cpf", response_model=LoginResponse)
def login_cpf(
    payload: LoginCPFRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """Login por CPF e senha."""
    cpf = _normalize_cpf(payload.cpf)
    user = db.query(User).filter(User.cpf == cpf).first()

    if not user:
        db.add(
            AuthAuditLog.log_login_failed(
                "USER_NOT_FOUND",
                cpf=cpf,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Credenciais inválidas")

    if not user.is_active:
        db.add(
            AuthAuditLog.log_login_failed(
                "ACCOUNT_INACTIVE",
                cpf=cpf,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Conta desativada")

    if user.is_locked:
        db.add(
            AuthAuditLog.log_login_failed(
                "ACCOUNT_LOCKED",
                cpf=cpf,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Conta bloqueada. Tente novamente mais tarde.")

    if not verify_password(payload.password, user.password_hash):
        user.increment_failed_login()
        db.add(
            AuthAuditLog.log_login_failed(
                "INVALID_PASSWORD",
                cpf=cpf,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Credenciais inválidas")

    # Login bem-sucedido
    user.record_login()
    tenants = _get_user_tenants(db, user)
    current_tenant_id = user.tenant_id or (tenants[0].id if tenants else None)

    access_token, refresh_token = _create_tokens(user, current_tenant_id)

    db.add(
        AuthAuditLog.log_login_success(
            user.id,
            current_tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            cpf=cpf,
        )
    )
    db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
        user=UserMe(
            id=user.id,
            email=user.email,
            cpf=user.cpf,
            full_name=user.full_name,
            phone=user.phone,
            tenant_id=current_tenant_id,
            is_platform_admin=user.is_platform_admin,
            must_change_password=user.must_change_password,
            roles=user_role_keys(user),
        ),
        tenants=tenants,
        current_tenant_id=current_tenant_id,
    )


# ==============================================================================
# OTP (One-Time Password)
# ==============================================================================


@router.post("/login/otp/request", response_model=OTPRequestResponse)
def request_otp(
    payload: OTPRequestPayload,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """Solicita envio de código OTP por SMS ou WhatsApp."""
    cpf = _normalize_cpf(payload.cpf)
    user = db.query(User).filter(User.cpf == cpf, User.is_active == True).first()

    if not user or not user.phone:
        # Sempre retorna sucesso por segurança
        return OTPRequestResponse(
            message="Se o CPF estiver cadastrado, enviaremos o código.",
            masked_phone="(**) *****-****",
            expires_in=300,
        )

    # Gera código OTP
    otp_code = AuthToken.generate_otp()
    token = AuthToken.generate_token()

    # Salva token
    auth_token = AuthToken(
        token_type="otp",
        token_hash=AuthToken.hash_token(token),
        user_id=user.id,
        phone=user.phone,
        otp_code=otp_code,
        expires_at=AuthToken.expires_in_minutes(5),
        ip_address=meta.get("ip"),
        user_agent=meta.get("user_agent"),
    )
    db.add(auth_token)

    # Log de auditoria
    db.add(AuthAuditLog.log_otp_sent(user.phone, payload.method, user_id=user.id))
    db.commit()

    # TODO: Integrar com serviço de SMS/WhatsApp
    # sms_service.send(user.phone, f"Seu código NR Soluções: {otp_code}")

    # Em dev, logar o código
    if settings.DEBUG:
        print(f"[DEV] OTP para {cpf}: {otp_code}")

    return OTPRequestResponse(
        message="Código enviado!", masked_phone=_mask_phone(user.phone), expires_in=300
    )


@router.post("/login/otp/verify", response_model=LoginResponse)
def verify_otp(
    payload: OTPVerifyPayload,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """Verifica código OTP e faz login."""
    cpf = _normalize_cpf(payload.cpf)
    user = db.query(User).filter(User.cpf == cpf, User.is_active == True).first()

    if not user:
        raise Unauthorized("Código inválido ou expirado")

    # Busca token OTP mais recente válido
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
        db.add(
            AuthAuditLog.log_login_failed(
                "INVALID_OTP",
                cpf=cpf,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.commit()
        raise Unauthorized("Código inválido ou expirado")

    # Marca token como usado
    auth_token.mark_used()

    # Login bem-sucedido
    user.record_login()
    tenants = _get_user_tenants(db, user)
    current_tenant_id = user.tenant_id or (tenants[0].id if tenants else None)

    access_token, refresh_token = _create_tokens(user, current_tenant_id)

    db.add(
        AuthAuditLog.log_login_success(
            user.id,
            current_tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            cpf=cpf,
        )
    )
    db.commit()

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
        user=UserMe(
            id=user.id,
            email=user.email,
            cpf=user.cpf,
            full_name=user.full_name,
            phone=user.phone,
            tenant_id=current_tenant_id,
            is_platform_admin=user.is_platform_admin,
            must_change_password=user.must_change_password,
            roles=user_role_keys(user),
        ),
        tenants=tenants,
        current_tenant_id=current_tenant_id,
    )


# ==============================================================================
# SELECIONAR TENANT
# ==============================================================================


@router.post("/select-tenant", response_model=LoginResponse)
def select_tenant(
    payload: SelectTenantRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Seleciona tenant para a sessão atual."""
    # Verifica se usuário tem acesso ao tenant
    role_scope = (
        db.query(UserRoleScope)
        .filter(
            UserRoleScope.user_id == user.id,
            UserRoleScope.tenant_id == payload.tenant_id,
            UserRoleScope.is_active == True,
        )
        .first()
    )

    if not role_scope and not user.is_platform_admin:
        raise Unauthorized("Você não tem acesso a esta empresa")

    tenant = db.query(Tenant).filter(Tenant.id == payload.tenant_id).first()
    if not tenant:
        raise NotFound("Empresa não encontrada")

    tenants = _get_user_tenants(db, user)
    access_token, refresh_token = _create_tokens(user, payload.tenant_id)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=900,
        user=UserMe(
            id=user.id,
            email=user.email,
            cpf=user.cpf,
            full_name=user.full_name,
            phone=user.phone,
            tenant_id=payload.tenant_id,
            is_platform_admin=user.is_platform_admin,
            must_change_password=user.must_change_password,
            roles=user_role_keys(user),
        ),
        tenants=tenants,
        current_tenant_id=payload.tenant_id,
    )


# ==============================================================================
# ME
# ==============================================================================


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Retorna informações do usuário logado."""
    # Busca nome do tenant
    tenant_info = None
    if user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant:
            tenant_info = {
                "id": str(tenant.id),
                "name": tenant.name,
                "slug": tenant.slug,
            }

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


# ==============================================================================
# LOGOUT
# ==============================================================================


@router.post("/logout")
def logout(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Registra logout do usuário."""
    db.add(
        AuthAuditLog.log_logout(
            user.id,
            user.tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
    )
    db.commit()
    return {"message": "Logout realizado"}


# ==============================================================================
# ALTERAR SENHA
# ==============================================================================


@router.post("/password/change")
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """Altera senha do usuário logado."""
    if not verify_password(payload.current_password, user.password_hash):
        raise BadRequest("Senha atual incorreta")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.password_changed_at = datetime.utcnow()

    db.add(
        AuthAuditLog.log_password_changed(
            user.id,
            user.tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
    )
    db.add(
        make_audit_event(
            tenant_id=user.tenant_id,
            actor_user_id=user.id,
            action="PASSWORD_CHANGE",
            entity_type="USER",
            entity_id=user.id,
            before=None,
            after=None,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()

    return {"message": "Senha alterada com sucesso"}


# ==============================================================================
# RESET DE SENHA
# ==============================================================================
@router.post("/password-reset/start", response_model=PasswordResetStartOut)
def password_reset_start(
    payload: PasswordResetStartRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    raw = None

    if user:
        raw = secrets.token_urlsafe(32)
        rec = PasswordResetToken(
            tenant_id=user.tenant_id,
            user_id=user.id,
            token_hash=_sha256(raw),
            expires_at=datetime.utcnow()
            + timedelta(minutes=int(settings.PASSWORD_RESET_TOKEN_TTL_MINUTES or 30)),
            consumed_at=None,
            requested_ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
        db.add(rec)
        db.add(
            AuthAuditLog.log_password_reset_request(
                email=email,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )
        db.add(
            make_audit_event(
                tenant_id=user.tenant_id,
                actor_user_id=user.id,
                action="PASSWORD_RESET_REQUEST",
                entity_type="USER",
                entity_id=user.id,
                before=None,
                after={"email": user.email},
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
                request_id=meta.get("request_id"),
            )
        )
        db.commit()

        # Enviar email com link de reset
        reset_url = f"{settings.FRONTEND_URL}/recuperar-senha?token={raw}"
        email_service.send_password_reset(
            to_email=user.email, reset_url=reset_url, user_name=user.full_name
        )

    return PasswordResetStartOut(
        status="ok",
        dev_token=(raw if settings.DEV_RETURN_PASSWORD_RESET_TOKEN else None),
    )


@router.post("/password-reset/confirm", response_model=PasswordResetConfirmOut)
def password_reset_confirm(
    payload: PasswordResetConfirmRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    token_hash = _sha256(payload.token)
    rec = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == token_hash)
        .first()
    )
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
    db.add(
        AuthAuditLog.log_password_changed(
            user.id,
            user.tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
    )
    db.add(
        make_audit_event(
            tenant_id=user.tenant_id,
            actor_user_id=user.id,
            action="PASSWORD_RESET_CONFIRM",
            entity_type="USER",
            entity_id=user.id,
            before=None,
            after={"email": user.email},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    return PasswordResetConfirmOut(status="ok")
