from __future__ import annotations
from pydantic import BaseModel
from uuid import UUID
from typing import Optional, List

class OtpStartRequest(BaseModel):
    tenant_id: UUID
    identifier: str

class OtpVerifyRequest(BaseModel):
    tenant_id: UUID
    identifier: str
    code: str

class MagicLinkConsumeResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class EmployeeMe(BaseModel):
    id: UUID
    identifier: str
    full_name: Optional[str] = None
    org_unit_id: Optional[UUID] = None

class EmployeeAssignmentOut(BaseModel):
    assignment_id: UUID
    content_item_id: Optional[UUID] = None
    learning_path_id: Optional[UUID] = None
    status: str
    due_at: Optional[str] = None
