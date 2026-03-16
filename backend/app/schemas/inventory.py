from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class HazardCatalogItemOut(BaseModel):
    id: UUID
    code: str
    hazard_group: str
    name: str
    description: str | None = None
    legal_basis: str | None = None
    control_suggestions: list[str] = []
    default_evidence_requirements: list[str] = []
    is_active: bool
    created_at: datetime
    updated_at: datetime


class RiskInventoryItemCreate(BaseModel):
    cnpj_id: UUID
    org_unit_id: UUID | None = None
    catalog_item_id: UUID | None = None
    process_name: str
    activity_name: str
    position_name: str | None = None
    hazard_group: str
    hazard_name: str
    source_or_circumstance: str | None = None
    possible_damage: str | None = None
    exposed_workers: int = Field(default=0, ge=0)
    exposure_notes: str | None = None
    existing_controls: list[str] = []
    proposed_controls: list[str] = []
    evidence_requirements: list[str] = []
    traceability: dict[str, Any] = {}
    severity: int = Field(default=1, ge=1, le=5)
    probability: int = Field(default=1, ge=1, le=5)
    residual_severity: int | None = Field(default=None, ge=1, le=5)
    residual_probability: int | None = Field(default=None, ge=1, le=5)
    review_due_at: datetime | None = None


class RiskInventoryItemUpdate(BaseModel):
    process_name: str | None = None
    activity_name: str | None = None
    position_name: str | None = None
    hazard_group: str | None = None
    hazard_name: str | None = None
    source_or_circumstance: str | None = None
    possible_damage: str | None = None
    exposed_workers: int | None = Field(default=None, ge=0)
    exposure_notes: str | None = None
    existing_controls: list[str] | None = None
    proposed_controls: list[str] | None = None
    evidence_requirements: list[str] | None = None
    traceability: dict[str, Any] | None = None
    severity: int | None = Field(default=None, ge=1, le=5)
    probability: int | None = Field(default=None, ge=1, le=5)
    residual_severity: int | None = Field(default=None, ge=1, le=5)
    residual_probability: int | None = Field(default=None, ge=1, le=5)
    review_due_at: datetime | None = None
    status: str | None = None
    approval_notes: str | None = None


class InventoryApprovePayload(BaseModel):
    approval_notes: str | None = None


class RiskInventoryItemOut(BaseModel):
    id: UUID
    tenant_id: UUID
    cnpj_id: UUID
    org_unit_id: UUID | None = None
    catalog_item_id: UUID | None = None
    process_name: str
    activity_name: str
    position_name: str | None = None
    hazard_group: str
    hazard_name: str
    source_or_circumstance: str | None = None
    possible_damage: str | None = None
    exposed_workers: int
    exposure_notes: str | None = None
    existing_controls: list[str] = []
    proposed_controls: list[str] = []
    evidence_requirements: list[str] = []
    traceability: dict[str, Any] = {}
    severity: int
    probability: int
    risk_score: int
    risk_level: str
    residual_severity: int | None = None
    residual_probability: int | None = None
    residual_risk_score: int | None = None
    residual_risk_level: str | None = None
    status: str
    reviewed_at: datetime | None = None
    review_due_at: datetime | None = None
    approved_at: datetime | None = None
    approval_notes: str | None = None
    created_at: datetime
    updated_at: datetime
