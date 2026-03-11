from __future__ import annotations
from pydantic import BaseModel
from uuid import UUID
from typing import Dict, Any, Optional
from datetime import datetime


class CriterionCreate(BaseModel):
    name: str
    content: Dict[str, Any]


class CriterionOut(BaseModel):
    id: UUID
    tenant_id: Optional[UUID] = None  # None = plataforma
    name: str
    status: str
    version: int
    content: Dict[str, Any]
    published_at: Optional[datetime] = None
    created_at: datetime


class RiskAssessmentOut(BaseModel):
    id: UUID
    campaign_id: UUID
    campaign_name: Optional[str] = None  # NOVO: nome da campanha
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    org_unit_name: Optional[str] = None  # NOVO: nome da unidade/setor
    criterion_version_id: UUID
    criterion_name: Optional[str] = None  # NOVO: nome do critério
    score: float
    level: str
    dimension_scores: Dict[str, Any]
    assessed_at: datetime
    created_at: datetime
