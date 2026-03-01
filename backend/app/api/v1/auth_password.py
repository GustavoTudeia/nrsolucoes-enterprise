"""Endpoints de recuperação de senha e OTP."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_request_meta
from app.core.config import settings
from app.core.errors import BadRequest, NotFound
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.user import User
from app.models.auth_audit_log import AuthAuditLog
from app.services.email_service import email_service

router = APIRouter(prefix="/auth", tags=["auth"])


# =============================================================================
# SCHEMAS
# =============================================================================


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str = (
        "Se o email existir, você receberá instruções para redefinir sua senha."
    )


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)


class ResetPasswordResponse(BaseModel):
    message: str = "Senha redefinida com sucesso!"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class ChangePasswordResponse(BaseModel):
    message: str = "Senha alterada com sucesso!"


class RequestOTPRequest(BaseModel):
    email: EmailStr


class RequestOTPResponse(BaseModel):
    message: str = "Se o email existir, você receberá um código de acesso."


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


class VerifyOTPResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_id: UUID
    tenant_id: Optional[UUID]


class RequestMagicLinkRequest(BaseModel):
    identifier: str  # CPF ou email


class RequestMagicLinkResponse(BaseModel):
    message: str = (
        "Se encontrarmos seu cadastro, você receberá um link de acesso por email."
    )


# =============================================================================
# HELPERS
# =============================================================================


def generate_reset_token() -> str:
    """Gera token seguro para reset de senha."""
    return secrets.token_urlsafe(32)


def generate_otp_code() -> str:
    """Gera código OTP de 6 dígitos."""
    return "".join([str(secrets.randbelow(10)) for _ in range(6)])


# =============================================================================
# ENDPOINTS - Esqueci Senha
# =============================================================================


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """
    Solicita recuperação de senha.
    Envia email com link se o usuário existir.
    """
    user = (
        db.query(User)
        .filter(User.email == payload.email, User.is_active == True)
        .first()
    )

    if user:
        # Gera token e salva no usuário
        token = generate_reset_token()
        user.password_reset_token = token
        user.password_reset_expires = datetime.utcnow() + timedelta(hours=1)

        # Log de auditoria
        db.add(
            AuthAuditLog.log_password_reset_request(
                email=payload.email,
                user_id=user.id,
                ip=meta.get("ip"),
                user_agent=meta.get("user_agent"),
            )
        )

        db.commit()

        # Envia email
        reset_url = f"{settings.FRONTEND_URL}/resetar-senha?token={token}"
        email_service.send_password_reset(
            to_email=user.email, reset_url=reset_url, user_name=user.full_name
        )

    # Sempre retorna sucesso para não revelar se email existe
    return ForgotPasswordResponse()


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """
    Redefine senha usando token recebido por email.
    """
    user = (
        db.query(User)
        .filter(User.password_reset_token == payload.token, User.is_active == True)
        .first()
    )

    if not user:
        raise BadRequest("Token inválido ou expirado")

    if (
        not user.password_reset_expires
        or user.password_reset_expires < datetime.utcnow()
    ):
        raise BadRequest("Token expirado. Solicite nova recuperação de senha.")

    # Atualiza senha
    user.password_hash = hash_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    user.must_change_password = False

    # Log de auditoria
    db.add(
        AuthAuditLog.log_password_changed(
            user_id=user.id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
    )

    db.commit()

    return ResetPasswordResponse()


@router.get("/validate-reset-token")
def validate_reset_token(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """
    Valida se token de reset ainda é válido.
    """
    user = (
        db.query(User)
        .filter(User.password_reset_token == token, User.is_active == True)
        .first()
    )

    if not user:
        return {"valid": False, "message": "Token inválido"}

    if (
        not user.password_reset_expires
        or user.password_reset_expires < datetime.utcnow()
    ):
        return {"valid": False, "message": "Token expirado"}

    return {"valid": True, "email": user.email}


# =============================================================================
# ENDPOINTS - Trocar Senha (logado)
# =============================================================================


@router.post("/change-password", response_model=ChangePasswordResponse)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    """
    Altera senha do usuário logado.
    """
    if not user.password_hash:
        raise BadRequest("Usuário não possui senha definida")

    if not verify_password(payload.current_password, user.password_hash):
        raise BadRequest("Senha atual incorreta")

    if payload.current_password == payload.new_password:
        raise BadRequest("A nova senha deve ser diferente da atual")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False

    # Log de auditoria
    db.add(
        AuthAuditLog.log_password_changed(
            user_id=user.id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
        )
    )

    db.commit()

    return ChangePasswordResponse()


# =============================================================================
# ENDPOINTS - OTP por Email
# =============================================================================


@router.post("/request-otp", response_model=RequestOTPResponse)
def request_otp(
    payload: RequestOTPRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """
    Solicita código OTP por email.
    """
    user = (
        db.query(User)
        .filter(User.email == payload.email, User.is_active == True)
        .first()
    )

    if user:
        code = generate_otp_code()
        user.otp_code = code
        user.otp_expires = datetime.utcnow() + timedelta(minutes=10)

        db.commit()

        # Envia email com código
        email_service.send_otp_code(
            to_email=user.email, code=code, user_name=user.full_name
        )

    return RequestOTPResponse()


@router.post("/verify-otp", response_model=VerifyOTPResponse)
def verify_otp(
    payload: VerifyOTPRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """
    Verifica código OTP e retorna tokens.
    """
    user = (
        db.query(User)
        .filter(User.email == payload.email, User.is_active == True)
        .first()
    )

    if not user:
        raise BadRequest("Código inválido ou expirado")

    if not user.otp_code or user.otp_code != payload.code:
        raise BadRequest("Código inválido ou expirado")

    if not user.otp_expires or user.otp_expires < datetime.utcnow():
        raise BadRequest("Código expirado. Solicite um novo.")

    # Limpa OTP
    user.otp_code = None
    user.otp_expires = None
    user.last_login_at = datetime.utcnow()
    user.login_count = (user.login_count or 0) + 1

    # Log de auditoria
    db.add(
        AuthAuditLog.log_login_success(
            user_id=user.id,
            tenant_id=user.tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            email=user.email,
        )
    )

    db.commit()

    # Gera tokens
    from app.core.security import create_access_token

    access_token = create_access_token(
        subject=user.email,
        extra={
            "uid": str(user.id),
            "tid": str(user.tenant_id) if user.tenant_id else None,
            "pla": user.is_platform_admin,
        },
    )
    # Refresh token com expiração maior
    refresh_token = create_access_token(
        subject=user.email,
        extra={"uid": str(user.id), "type": "refresh"},
        expires_minutes=60 * 24 * 7,  # 7 dias
    )

    return VerifyOTPResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user_id=user.id,
        tenant_id=user.tenant_id,
    )


# =============================================================================
# ENDPOINTS - Magic Link (Portal do Colaborador)
# =============================================================================


@router.post("/request-magic-link", response_model=RequestMagicLinkResponse)
def request_magic_link(
    payload: RequestMagicLinkRequest,
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """
    Solicita link mágico para login sem senha (colaborador).
    Aceita CPF ou email como identificador.
    """
    import re

    identifier = payload.identifier.strip()

    # Detecta se é CPF ou email
    cpf_digits = re.sub(r"\D", "", identifier)

    if len(cpf_digits) == 11:
        # Busca por CPF
        user = (
            db.query(User)
            .filter(User.cpf == cpf_digits, User.is_active == True)
            .first()
        )
    elif "@" in identifier:
        # Busca por email
        user = (
            db.query(User)
            .filter(User.email == identifier, User.is_active == True)
            .first()
        )
    else:
        user = None

    if user and user.email:
        # Gera token de magic link
        token = generate_reset_token()
        user.magic_link_token = token
        user.magic_link_expires = datetime.utcnow() + timedelta(minutes=15)

        db.commit()

        # Monta URL do portal
        magic_url = f"{settings.FRONTEND_URL}/magic-login?token={token}"

        email_service.send_magic_link(
            to_email=user.email, magic_url=magic_url, user_name=user.full_name
        )

    return RequestMagicLinkResponse()


@router.post("/verify-magic-link")
def verify_magic_link(
    token: str = Query(...),
    db: Session = Depends(get_db),
    meta: dict = Depends(get_request_meta),
):
    """
    Verifica magic link e retorna tokens.
    """
    from app.core.security import create_access_token

    user = (
        db.query(User)
        .filter(User.magic_link_token == token, User.is_active == True)
        .first()
    )

    if not user:
        raise BadRequest("Link inválido ou expirado")

    if not user.magic_link_expires or user.magic_link_expires < datetime.utcnow():
        raise BadRequest("Link expirado. Solicite um novo.")

    # Limpa magic link (uso único)
    user.magic_link_token = None
    user.magic_link_expires = None
    user.last_login_at = datetime.utcnow()
    user.login_count = (user.login_count or 0) + 1

    # Log de auditoria
    db.add(
        AuthAuditLog.log_login_success(
            user_id=user.id,
            tenant_id=user.tenant_id,
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            email=user.email,
        )
    )

    db.commit()

    # Gera tokens
    access_token = create_access_token(
        subject=user.email,
        extra={
            "uid": str(user.id),
            "tid": str(user.tenant_id) if user.tenant_id else None,
            "pla": user.is_platform_admin,
        },
    )
    # Refresh token com expiração maior
    refresh_token = create_access_token(
        subject=user.email,
        extra={"uid": str(user.id), "type": "refresh"},
        expires_minutes=60 * 24 * 7,  # 7 dias
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id) if user.tenant_id else None,
    }
