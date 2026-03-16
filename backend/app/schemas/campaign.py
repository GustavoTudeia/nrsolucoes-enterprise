from __future__ import annotations

from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional, Dict, Any
from datetime import datetime


class CampaignCreate(BaseModel):
    name: str
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    questionnaire_version_id: UUID
    require_invitation: bool = False
    invitation_expires_days: int = Field(default=30, ge=1, le=365)


class CampaignOut(BaseModel):
    id: UUID
    name: str
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    questionnaire_version_id: UUID
    status: str
    require_invitation: bool = False
    invitation_expires_days: int = 30


class CampaignDetailOut(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    org_unit_name: Optional[str] = None
    questionnaire_version_id: UUID
    status: str
    response_count: int = 0
    require_invitation: bool = False
    invitation_expires_days: int = 30
    created_at: datetime
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None


class SurveyResponseSubmit(BaseModel):
    org_unit_id: Optional[UUID] = None
    answers: Dict[str, Any]
