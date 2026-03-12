from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional


class CNPJCreate(BaseModel):
    legal_name: str = Field(..., min_length=2, max_length=200)
    trade_name: Optional[str] = Field(default=None, max_length=200)
    cnpj_number: str = Field(..., description="Aceita com/sem máscara; armazenado como dígitos.")


class CNPJUpdate(BaseModel):
    legal_name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    trade_name: Optional[str] = Field(default=None, max_length=200)
    cnpj_number: Optional[str] = Field(default=None, description="Se informado, valida e aplica unicidade.")
    is_active: Optional[bool] = None


class CNPJOut(BaseModel):
    id: UUID
    legal_name: str
    trade_name: Optional[str] = None
    cnpj_number: str
    is_active: bool
    unit_count: int = 0
    employee_count: int = 0


class OrgUnitCreate(BaseModel):
    cnpj_id: UUID
    name: str = Field(..., min_length=2, max_length=200)
    unit_type: str = Field(default="unit", description="unit|sector")
    parent_unit_id: Optional[UUID] = None


class OrgUnitUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    unit_type: Optional[str] = None
    parent_unit_id: Optional[UUID] = None
    is_active: Optional[bool] = None


class OrgUnitOut(BaseModel):
    id: UUID
    cnpj_id: UUID
    name: str
    unit_type: str
    parent_unit_id: Optional[UUID] = None
    is_active: bool
    employee_count: int = 0
