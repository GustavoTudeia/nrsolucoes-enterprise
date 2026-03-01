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
    tenant_id: UUID
    campaign_id: UUID
    cnpj_id: UUID
    org_unit_id: Optional[UUID] = None
    criterion_version_id: UUID
    score: float
    level: str
    dimension_scores: Dict[str, Any]
    assessed_at: datetime
    created_at: datetime
