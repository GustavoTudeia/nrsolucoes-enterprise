from __future__ import annotations
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from uuid import UUID
import re


class PublicSignupRequest(BaseModel):
    company_name: str = Field(..., min_length=2)
    cnpj: Optional[str] = None
    slug: str = Field(..., min_length=2)
    admin_email: EmailStr
    admin_name: Optional[str] = None
    admin_cpf: Optional[str] = None
    admin_phone: Optional[str] = None
    admin_password: str = Field(..., min_length=8)
    affiliate_code: Optional[str] = None
    plan_key: Optional[str] = None

    @field_validator("cnpj")
    @classmethod
    def validate_cnpj(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        cnpj = re.sub(r"[^\d]", "", v)
        if len(cnpj) != 14:
            raise ValueError("CNPJ deve ter 14 dígitos")
        return cnpj

    @field_validator("admin_cpf")
    @classmethod
    def validate_cpf(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        cpf = re.sub(r"[^\d]", "", v)
        if len(cpf) != 11:
            raise ValueError("CPF deve ter 11 dígitos")
        return cpf

    @field_validator("admin_phone")
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        phone = re.sub(r"[^\d]", "", v)
        if len(phone) < 10 or len(phone) > 11:
            raise ValueError("Telefone inválido")
        return phone


class PublicSignupResponse(BaseModel):
    tenant_id: UUID
    access_token: str
    token_type: str = "bearer"
