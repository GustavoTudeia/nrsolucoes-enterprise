from __future__ import annotations

from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID
from typing import Optional


class ContentCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    content_type: str = Field(default="video", description="video|pdf|link")
    url: Optional[str] = Field(default=None, description="Obrigatório para content_type=link. Para uploads, deixe vazio.")
    duration_minutes: Optional[int] = None
    is_platform_managed: bool = False


class ContentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    url: Optional[str] = None
    duration_minutes: Optional[int] = None
    is_active: Optional[bool] = None


class ContentUploadCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    filename: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(default="application/octet-stream", max_length=120)
    duration_seconds: Optional[int] = None
    is_platform_managed: bool = False


class ContentUploadOut(BaseModel):
    content_id: UUID
    upload_url: str
    method: str = "PUT"
    expires_in_seconds: int


class ContentAccessOut(BaseModel):
    content_id: UUID
    access_url: str
    expires_in_seconds: int


class ContentOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    content_type: str
    url: Optional[str] = None
    storage_key: Optional[str] = None
    duration_minutes: Optional[int] = None
    is_platform_managed: bool
    is_active: bool


class LearningPathCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    content_item_ids: list[UUID] = Field(default_factory=list, description="Ordered list of content IDs")


class LearningPathUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=500)
    content_item_ids: Optional[list[UUID]] = None


class LearningPathItemOut(BaseModel):
    id: UUID
    content_item_id: UUID
    order_index: int
    content_title: Optional[str] = None


class LearningPathOut(BaseModel):
    id: UUID
    tenant_id: Optional[UUID] = None
    title: str
    description: Optional[str] = None
    is_platform_managed: bool
    is_active: bool = True
    items: list[LearningPathItemOut] = Field(default_factory=list)
    created_at: datetime


class AssignmentCreate(BaseModel):
    content_item_id: Optional[UUID] = None
    learning_path_id: Optional[UUID] = None
    employee_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None


class AssignmentUpdate(BaseModel):
    due_at: Optional[datetime] = None
    status: Optional[str] = None


class AssignmentOut(BaseModel):
    id: UUID
    content_item_id: Optional[UUID] = None
    learning_path_id: Optional[UUID] = None
    employee_id: Optional[UUID] = None
    org_unit_id: Optional[UUID] = None
    due_at: Optional[datetime] = None
    status: str
    created_at: datetime

    progress_seconds: Optional[int] = None
    duration_seconds: Optional[int] = None
    completed_at: Optional[datetime] = None


class BulkAssignmentCreate(BaseModel):
    content_item_id: Optional[UUID] = None
    learning_path_id: Optional[UUID] = None
    employee_ids: Optional[list[UUID]] = Field(default=None)
    org_unit_ids: Optional[list[UUID]] = Field(default=None)


class CompletionCreate(BaseModel):
    assignment_id: UUID
    completion_method: str = "manual"


class ProgressUpdate(BaseModel):
    assignment_id: UUID
    position_seconds: int = Field(..., ge=0)
    duration_seconds: Optional[int] = Field(default=None, ge=0)


class ProgressOut(BaseModel):
    assignment_id: UUID
    employee_id: UUID
    position_seconds: int
    duration_seconds: Optional[int] = None
    last_event_at: datetime


class LMSStatsOut(BaseModel):
    total_contents: int = 0
    total_assignments: int = 0
    total_completed: int = 0
    total_in_progress: int = 0
    completion_rate: float = 0.0
    contents_by_type: dict[str, int] = Field(default_factory=dict)
    assignments_by_status: dict[str, int] = Field(default_factory=dict)
