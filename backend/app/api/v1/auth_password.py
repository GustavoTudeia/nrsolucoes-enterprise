"""Endpoints complementares de recuperação de senha, OTP e magic link."""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_request_meta
from app.core.config import settings
from app.core.errors import BadRequest
from app.core.rate_limit import enforce_rate_limit
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.auth_audit_log import AuthAuditLog
from app.models.user import User
from app.services.email_service import email_service
from app.services.refresh_tokens import issue_token_pair

router = APIRouter(prefix="/auth", tags=["auth"])


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str = "Se o email existir, você receberá instruções para redefinir sua senha."


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
    identifier: str


class RequestMagicLinkResponse(BaseModel):
    message: str = "Se encontrarmos seu cadastro, você receberá um link de acesso por email."



def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)



def generate_otp_code() -> str:
    return "".join([str(secrets.randbelow(10)) for _ in range(6)])


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    enforce_rate_limit(
        scope="auth:forgot-password",
        identifier=f"{meta.get('ip', '-')}:email:{payload.email.lower().strip()}",
        limit=settings.AUTH_RATE_LIMIT_PASSWORD_RESET,
        window_seconds=settings.AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.email == payload.email, User.is_active == True).first()
    if user:
        token = generate_reset_token()
        user.password_reset_token = token
        user.password_reset_expires = datetime.utcnow() + timedelta(hours=1)
        db.add(user)
        db.add(AuthAuditLog.log_password_reset_request(email=payload.email, user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
        db.commit()
        reset_url = f"{settings.FRONTEND_URL}/resetar-senha?token={token}"
        email_service.queue_password_reset(to_email=user.email, reset_url=reset_url, user_name=user.full_name)
    return ForgotPasswordResponse()


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    user = db.query(User).filter(User.password_reset_token == payload.token, User.is_active == True).first()
    if not user:
        raise BadRequest("Token inválido ou expirado")
    if not user.password_reset_expires or user.password_reset_expires < datetime.utcnow():
        raise BadRequest("Token expirado. Solicite nova recuperação de senha.")
    user.password_hash = hash_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    user.must_change_password = False
    db.add(user)
    db.add(AuthAuditLog.log_password_changed(user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
    db.commit()
    return ResetPasswordResponse()


@router.get("/validate-reset-token")
def validate_reset_token(token: str = Query(...), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.password_reset_token == token, User.is_active == True).first()
    if not user:
        return {"valid": False, "message": "Token inválido"}
    if not user.password_reset_expires or user.password_reset_expires < datetime.utcnow():
        return {"valid": False, "message": "Token expirado"}
    return {"valid": True, "email": user.email}


@router.post("/change-password", response_model=ChangePasswordResponse)
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user), meta: dict = Depends(get_request_meta)):
    if not user.password_hash:
        raise BadRequest("Usuário não possui senha definida")
    if not verify_password(payload.current_password, user.password_hash):
        raise BadRequest("Senha atual incorreta")
    if payload.current_password == payload.new_password:
        raise BadRequest("A nova senha deve ser diferente da atual")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.add(user)
    db.add(AuthAuditLog.log_password_changed(user_id=user.id, ip=meta.get("ip"), user_agent=meta.get("user_agent")))
    db.commit()
    return ChangePasswordResponse()


@router.post("/request-otp", response_model=RequestOTPResponse)
def request_otp(payload: RequestOTPRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    email = payload.email.lower().strip()
    enforce_rate_limit(
        scope="auth:otp-request-email",
        identifier=f"{meta.get('ip', '-')}:email:{email}",
        limit=settings.AUTH_RATE_LIMIT_OTP_REQUEST,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if user:
        code = generate_otp_code()
        user.otp_code = code
        user.otp_expires = datetime.utcnow() + timedelta(minutes=10)
        db.add(user)
        db.commit()
        email_service.queue_otp_code(to_email=user.email, code=code, user_name=user.full_name)
    return RequestOTPResponse()


@router.post("/verify-otp", response_model=VerifyOTPResponse)
def verify_otp(payload: VerifyOTPRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    email = payload.email.lower().strip()
    enforce_rate_limit(
        scope="auth:otp-verify-email",
        identifier=f"{meta.get('ip', '-')}:email:{email}",
        limit=settings.AUTH_RATE_LIMIT_OTP_VERIFY,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user or not user.otp_code or user.otp_code != payload.code:
        raise BadRequest("Código inválido ou expirado")
    if not user.otp_expires or user.otp_expires < datetime.utcnow():
        raise BadRequest("Código expirado. Solicite um novo.")
    user.otp_code = None
    user.otp_expires = None
    user.last_login_at = datetime.utcnow()
    user.login_count = (user.login_count or 0) + 1
    access_token, refresh_token = issue_token_pair(db, user=user, tenant_id=user.tenant_id, ip_address=meta.get("ip"), user_agent=meta.get("user_agent"))
    db.add(user)
    db.add(AuthAuditLog.log_login_success(user_id=user.id, tenant_id=user.tenant_id, ip=meta.get("ip"), user_agent=meta.get("user_agent"), email=user.email))
    db.commit()
    return VerifyOTPResponse(access_token=access_token, refresh_token=refresh_token, user_id=user.id, tenant_id=user.tenant_id)


@router.post("/request-magic-link", response_model=RequestMagicLinkResponse)
def request_magic_link(payload: RequestMagicLinkRequest, db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    identifier = payload.identifier.strip()
    enforce_rate_limit(
        scope="auth:magic-link",
        identifier=f"{meta.get('ip', '-')}:id:{identifier.lower()}",
        limit=settings.AUTH_RATE_LIMIT_MAGIC_LINK,
        window_seconds=settings.AUTH_RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS,
    )
    cpf_digits = re.sub(r"\D", "", identifier)
    if len(cpf_digits) == 11:
        user = db.query(User).filter(User.cpf == cpf_digits, User.is_active == True).first()
    elif "@" in identifier:
        user = db.query(User).filter(User.email == identifier, User.is_active == True).first()
    else:
        user = None
    if user and user.email:
        token = generate_reset_token()
        user.magic_link_token = token
        user.magic_link_expires = datetime.utcnow() + timedelta(minutes=15)
        db.add(user)
        db.commit()
        magic_url = f"{settings.FRONTEND_URL}/magic-login?token={token}"
        email_service.queue_magic_link(to_email=user.email, magic_url=magic_url, user_name=user.full_name)
    return RequestMagicLinkResponse()


@router.post("/verify-magic-link")
def verify_magic_link(token: str = Query(...), db: Session = Depends(get_db), meta: dict = Depends(get_request_meta)):
    enforce_rate_limit(
        scope="auth:magic-link-verify",
        identifier=f"{meta.get('ip', '-')}:token:{token[:12]}",
        limit=settings.AUTH_RATE_LIMIT_OTP_VERIFY,
        window_seconds=settings.AUTH_RATE_LIMIT_LOGIN_WINDOW_SECONDS,
    )
    user = db.query(User).filter(User.magic_link_token == token, User.is_active == True).first()
    if not user:
        raise BadRequest("Link inválido ou expirado")
    if not user.magic_link_expires or user.magic_link_expires < datetime.utcnow():
        raise BadRequest("Link expirado. Solicite um novo.")
    user.magic_link_token = None
    user.magic_link_expires = None
    user.last_login_at = datetime.utcnow()
    user.login_count = (user.login_count or 0) + 1
    access_token, refresh_token = issue_token_pair(db, user=user, tenant_id=user.tenant_id, ip_address=meta.get("ip"), user_agent=meta.get("user_agent"))
    db.add(user)
    db.add(AuthAuditLog.log_login_success(user_id=user.id, tenant_id=user.tenant_id, ip=meta.get("ip"), user_agent=meta.get("user_agent"), email=user.email))
    db.commit()
    return {"access_token": access_token, "refresh_token": refresh_token, "user_id": str(user.id), "tenant_id": str(user.tenant_id) if user.tenant_id else None}
