"""Schemas de Gestão de Usuários."""
from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime
from uuid import UUID
import re


# ==============================================================================
# USUÁRIO
# ==============================================================================

class UserCreate(BaseModel):
    """Criar usuário (uso interno/admin)."""
    email: Optional[EmailStr] = None
    cpf: Optional[str] = Field(None, min_length=11, max_length=14)
    full_name: str = Field(..., min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    password: str = Field(..., min_length=8)
    is_active: bool = True

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Senha deve ter no mínimo 8 caracteres")
        if not re.search(r"\d", v):
            raise ValueError("Senha deve conter pelo menos 1 número")
        return v


class UserUpdate(BaseModel):
    """Atualizar usuário."""
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    cpf: Optional[str] = Field(None, min_length=11, max_length=14)
    is_active: Optional[bool] = None

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf


class UserRoleInfo(BaseModel):
    """Informações de papel do usuário."""
    id: UUID
    role_key: str
    role_name: str
    tenant_id: Optional[UUID]
    tenant_name: Optional[str]
    cnpj_id: Optional[UUID]
    cnpj_name: Optional[str]
    org_unit_id: Optional[UUID]
    org_unit_name: Optional[str]
    granted_by_name: Optional[str]
    granted_at: datetime
    expires_at: Optional[datetime]
    is_active: bool


class UserOut(BaseModel):
    """Usuário completo."""
    id: UUID
    email: Optional[str]
    cpf: Optional[str]
    full_name: Optional[str]
    phone: Optional[str]
    is_active: bool
    is_platform_admin: bool
    must_change_password: bool
    last_login_at: Optional[datetime]
    login_count: int
    invited_by_name: Optional[str]
    invited_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    roles: List[UserRoleInfo] = []
    linked_employee_id: Optional[UUID] = None
    linked_employee_name: Optional[str] = None


class UserListItem(BaseModel):
    """Usuário para listagem."""
    id: UUID
    email: Optional[str]
    cpf: Optional[str]
    full_name: Optional[str]
    is_active: bool
    last_login_at: Optional[datetime]
    roles: List[str]  # Lista de nomes de papéis
    invited_by_name: Optional[str]
    created_at: datetime


class UserListOut(BaseModel):
    """Lista de usuários."""
    items: List[UserListItem]
    total: int


# ==============================================================================
# PAPÉIS
# ==============================================================================

class RoleAssign(BaseModel):
    """Atribuir papel a usuário."""
    role_key: str = Field(..., min_length=1, max_length=60)
    tenant_id: Optional[UUID] = None  # Se None, usa tenant atual
    cnpj_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None


class RoleRemove(BaseModel):
    """Remover papel."""
    role_scope_id: UUID


class RoleOut(BaseModel):
    """Papel disponível."""
    id: UUID
    key: str
    name: str
    description: Optional[str]
    is_system: bool


class RoleListOut(BaseModel):
    """Lista de papéis disponíveis."""
    items: List[RoleOut]


# ==============================================================================
# AÇÕES
# ==============================================================================

class UserDeactivateOut(BaseModel):
    """Resposta de desativação."""
    message: str = "Usuário desativado"
    deactivated_at: datetime


class UserReactivateOut(BaseModel):
    """Resposta de reativação."""
    message: str = "Usuário reativado"


class UserResetPasswordOut(BaseModel):
    """Resposta de reset de senha."""
    message: str = "Email de recuperação enviado"


class UserDeleteOut(BaseModel):
    """Resposta de exclusão."""
    deleted: bool = True


# ==============================================================================
# AUDITORIA
# ==============================================================================

class AuthAuditLogItem(BaseModel):
    """Item de log de auditoria."""
    id: UUID
    event_type: str
    email: Optional[str]
    cpf: Optional[str]
    success: bool
    failure_reason: Optional[str]
    ip_address: Optional[str]
    location_city: Optional[str]
    location_country: Optional[str]
    created_at: datetime


class AuthAuditLogOut(BaseModel):
    """Lista de logs de auditoria."""
    items: List[AuthAuditLogItem]
    total: int
