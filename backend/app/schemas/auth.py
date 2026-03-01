from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator
from uuid import UUID
from typing import Optional, List
from datetime import datetime
import re


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginCPFRequest(BaseModel):
    """Login por CPF + senha."""
    cpf: str = Field(..., min_length=11, max_length=14)
    password: str = Field(..., min_length=1)

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: str) -> str:
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf


class TokenPair(BaseModel):
    """Par de tokens (access + refresh)."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 900  # 15 minutos


class UserMe(BaseModel):
    id: UUID
    email: Optional[EmailStr] = None
    cpf: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    tenant_id: Optional[UUID] = None
    is_platform_admin: bool
    must_change_password: bool = False
    roles: List[str] = []


class TenantInfo(BaseModel):
    """Informações de tenant para seleção."""
    id: UUID
    name: str
    role_key: str
    role_name: str


class LoginResponse(BaseModel):
    """Resposta de login completa."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 900
    user: UserMe
    tenants: List[TenantInfo] = []
    current_tenant_id: Optional[UUID] = None


class RefreshTokenRequest(BaseModel):
    """Solicitar renovação de tokens."""
    refresh_token: str


class PasswordResetStartRequest(BaseModel):
    email: EmailStr


class PasswordResetStartOut(BaseModel):
    status: str = "ok"
    dev_token: Optional[str] = None


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(..., min_length=16)
    new_password: str = Field(..., min_length=8, max_length=200)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Senha deve ter no mínimo 8 caracteres")
        if not re.search(r"\d", v):
            raise ValueError("Senha deve conter pelo menos 1 número")
        return v


class PasswordResetConfirmOut(BaseModel):
    status: str = "ok"


class PasswordChangeRequest(BaseModel):
    """Alterar senha (usuário autenticado)."""
    current_password: str
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Senha deve ter no mínimo 8 caracteres")
        if not re.search(r"\d", v):
            raise ValueError("Senha deve conter pelo menos 1 número")
        return v


class SelectTenantRequest(BaseModel):
    """Selecionar tenant para a sessão."""
    tenant_id: UUID


# ==============================================================================
# OTP (One-Time Password)
# ==============================================================================

class OTPRequestPayload(BaseModel):
    """Solicitar envio de OTP."""
    cpf: str = Field(..., min_length=11, max_length=14)
    method: str = Field(default="sms", pattern="^(sms|whatsapp)$")

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: str) -> str:
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf


class OTPRequestResponse(BaseModel):
    """Resposta após envio de OTP."""
    message: str
    masked_phone: str
    expires_in: int


class OTPVerifyPayload(BaseModel):
    """Verificar código OTP."""
    cpf: str = Field(..., min_length=11, max_length=14)
    code: str = Field(..., min_length=6, max_length=6)

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: str) -> str:
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf


# ==============================================================================
# MAGIC LINK
# ==============================================================================

class MagicLinkRequestPayload(BaseModel):
    """Solicitar magic link."""
    identifier: str = Field(..., min_length=5)  # email, cpf ou telefone
    method: str = Field(default="email", pattern="^(sms|whatsapp|email)$")


class MagicLinkRequestResponse(BaseModel):
    """Resposta após envio de magic link."""
    message: str
    masked_contact: str
    expires_in: int


# ==============================================================================
# PORTAL DO COLABORADOR
# ==============================================================================

class PortalLoginRequest(BaseModel):
    """Login do colaborador no portal."""
    cpf: str = Field(..., min_length=11, max_length=14)
    password: str = Field(..., min_length=1)

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: str) -> str:
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf


class PortalEmployeeInfo(BaseModel):
    """Informações do colaborador para o portal."""
    id: UUID
    identifier: str
    cpf: Optional[str] = None
    full_name: Optional[str] = None
    org_unit_name: Optional[str] = None
    tenant_name: str


class PortalLoginResponse(BaseModel):
    """Resposta de login do portal."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = 3600
    employee: PortalEmployeeInfo
    must_change_password: bool = False
