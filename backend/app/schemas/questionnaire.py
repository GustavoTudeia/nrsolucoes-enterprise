from __future__ import annotations

from pydantic import BaseModel
from uuid import UUID
from typing import Optional, Dict, Any
from datetime import datetime


class QuestionnaireTemplateCreate(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    is_platform_managed: bool = False


class QuestionnaireTemplateOut(BaseModel):
    id: UUID
    tenant_id: Optional[UUID] = None
    key: str
    name: str
    description: Optional[str] = None
    is_platform_managed: bool
    is_active: bool


class QuestionnaireTemplateDetailOut(QuestionnaireTemplateOut):
    created_at: datetime
    updated_at: datetime


class QuestionnaireVersionCreate(BaseModel):
    content: Dict[str, Any]


class QuestionnaireVersionOut(BaseModel):
    id: UUID
    template_id: UUID
    version: int
    status: str
    content: Dict[str, Any]


class QuestionnaireVersionDetailOut(QuestionnaireVersionOut):
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None
