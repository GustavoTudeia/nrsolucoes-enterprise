from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional, List


class TemplatePackCreate(BaseModel):
    key: str = Field(..., min_length=2, max_length=100)
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    is_active: bool = True


class TemplatePackOut(BaseModel):
    id: UUID
    key: str
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TemplatePackItemCreate(BaseModel):
    item_type: str = Field(..., description="questionnaire_template|content_item|learning_path")
    item_id: UUID
    order_index: int = 0


class TemplatePackItemOut(BaseModel):
    id: UUID
    pack_id: UUID
    item_type: str
    item_id: UUID
    order_index: int
    created_at: datetime


class TemplatePackDetailOut(TemplatePackOut):
    items: List[TemplatePackItemOut] = []
