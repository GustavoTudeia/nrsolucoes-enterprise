from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional, Any, Dict, List


class S2240Factor(BaseModel):
    code: str = Field(..., max_length=50, description="Código interno ou referência (não necessariamente o código oficial eSocial)")
    name: str = Field(..., max_length=200)
    details: Optional[str] = Field(default=None, max_length=500)
    intensity: Optional[str] = Field(default=None, max_length=100)


class S2240ProfileCreate(BaseModel):
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    role_name: str = Field(..., min_length=2, max_length=200)
    environment_code: Optional[str] = Field(default=None, max_length=50)
    activity_description: Optional[str] = Field(default=None, max_length=500)
    factors: List[S2240Factor] = []
    controls: Dict[str, Any] = Field(default_factory=dict)
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    is_active: bool = True


class S2240ProfileOut(BaseModel):
    id: UUID
    tenant_id: UUID
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    role_name: str
    environment_code: Optional[str] = None
    activity_description: Optional[str] = None
    factors: List[Dict[str, Any]]
    controls: Dict[str, Any]
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class S2210AccidentCreate(BaseModel):
    employee_id: UUID
    occurred_at: Optional[datetime] = None
    accident_type: Optional[str] = Field(default=None, max_length=50)
    description: Optional[str] = Field(default=None, max_length=1000)
    location: Optional[str] = Field(default=None, max_length=200)
    cat_number: Optional[str] = Field(default=None, max_length=60)
    payload: Dict[str, Any] = Field(default_factory=dict)


class S2210AccidentOut(BaseModel):
    id: UUID
    tenant_id: UUID
    employee_id: UUID
    occurred_at: datetime
    accident_type: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    cat_number: Optional[str] = None
    payload: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class S2220ExamCreate(BaseModel):
    employee_id: UUID
    exam_date: Optional[datetime] = None
    exam_type: Optional[str] = Field(default=None, max_length=80)
    result: Optional[str] = Field(default=None, max_length=200)
    payload: Dict[str, Any] = Field(default_factory=dict)


class S2220ExamOut(BaseModel):
    id: UUID
    tenant_id: UUID
    employee_id: UUID
    exam_date: datetime
    exam_type: Optional[str] = None
    result: Optional[str] = None
    payload: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ESocialExportOut(BaseModel):
    event: str
    generated_at: datetime
    data: Dict[str, Any]
