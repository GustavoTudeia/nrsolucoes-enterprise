from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator
from uuid import UUID
from typing import Optional, List
from datetime import datetime
import re


class UserCreate(BaseModel):
    email: Optional[EmailStr] = None
    cpf: Optional[str] = Field(None, min_length=11, max_length=14)
    full_name: Optional[str] = None
    phone: Optional[str] = None
    password: str = Field(..., min_length=8)

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf


class UserOut(BaseModel):
    id: UUID
    email: Optional[str] = None
    cpf: Optional[str] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    tenant_id: Optional[UUID] = None
    is_active: bool
    is_platform_admin: bool
    must_change_password: bool = False
    last_login_at: Optional[datetime] = None


class UserUpdate(BaseModel):
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


class RoleAssign(BaseModel):
    role_key: str
    tenant_id: Optional[UUID] = None
    cnpj_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None
    expires_at: Optional[datetime] = None


class RoleAssignmentOut(BaseModel):
    id: UUID
    role_key: str
    role_name: Optional[str] = None
    tenant_id: Optional[UUID] = None
    cnpj_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None
    granted_by_name: Optional[str] = None
    granted_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active: bool = True


class RoleOut(BaseModel):
    id: Optional[UUID] = None
    key: str
    name: str
    description: Optional[str] = None
    is_system: bool = True


class UserMeUpdate(BaseModel):
    """Schema para atualização do próprio perfil."""
    full_name: Optional[str] = Field(None, min_length=2, max_length=200)
    phone: Optional[str] = Field(None, max_length=20)
    cpf: Optional[str] = Field(None, min_length=11, max_length=14)

    @field_validator("cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf