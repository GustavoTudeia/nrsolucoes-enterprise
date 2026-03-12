from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

class EmployeeCreate(BaseModel):
    identifier: str
    full_name: Optional[str] = None
    cpf: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    admission_date: Optional[datetime] = None
    cnpj_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None

class EmployeeOut(BaseModel):
    id: UUID
    identifier: str
    full_name: Optional[str] = None
    cpf: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    job_title: Optional[str] = None
    admission_date: Optional[datetime] = None
    cnpj_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None
    is_active: bool
