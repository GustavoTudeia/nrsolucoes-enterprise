from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID
from typing import Optional, Dict, Any
from datetime import datetime


class CampaignCreate(BaseModel):
    name: str
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    questionnaire_version_id: UUID


class CampaignOut(BaseModel):
    # Mantido para compatibilidade (create/open/close)
    id: UUID
    name: str
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    questionnaire_version_id: UUID
    status: str


class CampaignDetailOut(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    questionnaire_version_id: UUID
    status: str
    created_at: datetime
    opened_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None


class SurveyResponseSubmit(BaseModel):
    # opcional: se a campanha estiver em nível de CNPJ, o frontend pode informar o setor/unidade
    org_unit_id: Optional[UUID] = None
    answers: Dict[str, Any]
