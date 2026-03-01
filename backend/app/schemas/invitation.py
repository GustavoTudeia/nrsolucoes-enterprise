"""Schemas de Convite de Usuários."""
from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime
from uuid import UUID
import re


# ==============================================================================
# CRIAR CONVITE
# ==============================================================================

class InvitationCreate(BaseModel):
    """Criar novo convite."""
    email: EmailStr
    full_name: Optional[str] = Field(None, max_length=200)
    role_key: str = Field(..., min_length=1, max_length=60)
    cnpj_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None
    expires_days: int = Field(default=7, ge=1, le=30)
    link_to_employee_id: Optional[UUID] = None  # Vincular a colaborador existente


class InvitationOut(BaseModel):
    """Convite retornado."""
    id: UUID
    tenant_id: UUID
    email: str
    full_name: Optional[str]
    role_key: str
    role_name: str
    cnpj_id: Optional[UUID]
    cnpj_name: Optional[str]
    org_unit_id: Optional[UUID]
    org_unit_name: Optional[str]
    status: str
    invited_by_name: str
    invited_by_email: str
    expires_at: datetime
    accepted_at: Optional[datetime]
    created_at: datetime


class InvitationListOut(BaseModel):
    """Lista de convites."""
    items: List[InvitationOut]
    total: int


# ==============================================================================
# VALIDAR CONVITE
# ==============================================================================

class InvitationValidateOut(BaseModel):
    """Resultado da validação de convite."""
    valid: bool
    message: Optional[str] = None
    invitation: Optional["InvitationPreview"] = None
    user_exists: bool = False


class InvitationPreview(BaseModel):
    """Preview do convite para aceitar."""
    email: str
    full_name: Optional[str]
    role_name: str
    tenant_name: str
    cnpj_name: Optional[str]
    org_unit_name: Optional[str]
    invited_by_name: str
    expires_at: datetime


# ==============================================================================
# ACEITAR CONVITE
# ==============================================================================

class InvitationAcceptNewUser(BaseModel):
    """Aceitar convite criando novo usuário."""
    full_name: str = Field(..., min_length=2, max_length=200)
    password: str = Field(..., min_length=8)
    cpf: Optional[str] = Field(None, min_length=11, max_length=14)
    phone: Optional[str] = Field(None, max_length=20)
    accept_terms: bool = True

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Senha deve ter no mínimo 8 caracteres")
        if not re.search(r"\d", v):
            raise ValueError("Senha deve conter pelo menos 1 número")
        return v

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf


class InvitationAcceptExistingUser(BaseModel):
    """Aceitar convite para usuário existente (apenas confirma)."""
    accept: bool = True


class InvitationAcceptResponse(BaseModel):
    """Resposta após aceitar convite."""
    message: str
    access_token: str
    refresh_token: str
    user_id: UUID
    tenant_id: UUID


# ==============================================================================
# AÇÕES EM CONVITES
# ==============================================================================

class InvitationResendOut(BaseModel):
    """Resposta de reenvio de convite."""
    message: str = "Convite reenviado com sucesso"
    new_expires_at: datetime


class InvitationCancelOut(BaseModel):
    """Resposta de cancelamento de convite."""
    cancelled: bool = True


# Forward refs
InvitationValidateOut.model_rebuild()
