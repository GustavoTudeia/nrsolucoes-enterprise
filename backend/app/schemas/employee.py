from __future__ import annotations
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

class EmployeeCreate(BaseModel):
    identifier: str
    full_name: Optional[str] = None
    org_unit_id: Optional[UUID] = None

class EmployeeOut(BaseModel):
    id: UUID
    identifier: str
    full_name: Optional[str] = None
    org_unit_id: Optional[UUID] = None
    is_active: bool
