from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PGRDocumentApprovalCreate(BaseModel):
    cnpj_id: UUID
    org_unit_id: UUID | None = None
    document_scope: str = Field(default="inventory")
    version_label: str | None = None
    statement: str | None = None
    notes: str | None = None
    effective_from: datetime | None = None
    review_due_at: datetime | None = None


class PGRDocumentApprovalOut(BaseModel):
    id: UUID
    tenant_id: UUID
    cnpj_id: UUID
    org_unit_id: UUID | None = None
    document_scope: str
    version_label: str
    status: str
    statement: str
    notes: str | None = None
    approver_name: str
    approver_role: str | None = None
    approver_email: str | None = None
    effective_from: datetime
    review_due_at: datetime | None = None
    approved_at: datetime
    inventory_item_count: int
    snapshot_hash: str
    snapshot_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ErgonomicAssessmentCreate(BaseModel):
    cnpj_id: UUID
    org_unit_id: UUID | None = None
    assessment_type: str = Field(default="AEP")
    title: str
    process_name: str | None = None
    activity_name: str | None = None
    position_name: str | None = None
    workstation_name: str | None = None
    demand_summary: str | None = None
    conditions_summary: str | None = None
    psychosocial_factors: list[str] = []
    findings: list[str] = []
    recommendations: list[str] = []
    traceability: dict[str, Any] = {}
    review_due_at: datetime | None = None


class ErgonomicAssessmentUpdate(BaseModel):
    assessment_type: str | None = None
    title: str | None = None
    status: str | None = None
    process_name: str | None = None
    activity_name: str | None = None
    position_name: str | None = None
    workstation_name: str | None = None
    demand_summary: str | None = None
    conditions_summary: str | None = None
    psychosocial_factors: list[str] | None = None
    findings: list[str] | None = None
    recommendations: list[str] | None = None
    traceability: dict[str, Any] | None = None
    review_due_at: datetime | None = None
    approval_notes: str | None = None


class ErgonomicAssessmentApprove(BaseModel):
    approval_notes: str | None = None


class ErgonomicAssessmentOut(BaseModel):
    id: UUID
    tenant_id: UUID
    cnpj_id: UUID
    org_unit_id: UUID | None = None
    assessment_type: str
    title: str
    status: str
    process_name: str | None = None
    activity_name: str | None = None
    position_name: str | None = None
    workstation_name: str | None = None
    demand_summary: str | None = None
    conditions_summary: str | None = None
    psychosocial_factors: list[str] = []
    findings: list[str] = []
    recommendations: list[str] = []
    traceability: dict[str, Any] = {}
    reviewed_at: datetime | None = None
    review_due_at: datetime | None = None
    approved_at: datetime | None = None
    approval_notes: str | None = None
    created_at: datetime
    updated_at: datetime
