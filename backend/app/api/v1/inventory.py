from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_any_role, tenant_id_from_user, get_request_meta, require_active_subscription, require_feature
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, NotFound
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER, ROLE_TENANT_AUDITOR
from app.db.session import get_db
from app.models.inventory import HazardCatalogItem, RiskInventoryItem
from app.models.org import OrgUnit
from app.schemas.common import Page
from app.services.analytics_service import capture_analytics_event
from app.services.tenant_health import upsert_tenant_health_snapshot

from app.schemas.inventory import (
    HazardCatalogItemOut,
    InventoryApprovePayload,
    RiskInventoryItemCreate,
    RiskInventoryItemOut,
    RiskInventoryItemUpdate,
)

router = APIRouter(prefix="/inventory")


def _calc_level(severity: int, probability: int) -> tuple[int, str]:
    score = int(severity) * int(probability)
    if score >= 15:
        return score, "high"
    if score >= 6:
        return score, "medium"
    return score, "low"


def _out(item: RiskInventoryItem) -> RiskInventoryItemOut:
    return RiskInventoryItemOut(
        id=item.id,
        tenant_id=item.tenant_id,
        cnpj_id=item.cnpj_id,
        org_unit_id=item.org_unit_id,
        catalog_item_id=item.catalog_item_id,
        process_name=item.process_name,
        activity_name=item.activity_name,
        position_name=item.position_name,
        hazard_group=item.hazard_group,
        hazard_name=item.hazard_name,
        source_or_circumstance=item.source_or_circumstance,
        possible_damage=item.possible_damage,
        exposed_workers=item.exposed_workers,
        exposure_notes=item.exposure_notes,
        existing_controls=item.existing_controls or [],
        proposed_controls=item.proposed_controls or [],
        evidence_requirements=item.evidence_requirements or [],
        traceability=item.traceability or {},
        severity=item.severity,
        probability=item.probability,
        risk_score=item.risk_score,
        risk_level=item.risk_level,
        residual_severity=item.residual_severity,
        residual_probability=item.residual_probability,
        residual_risk_score=item.residual_risk_score,
        residual_risk_level=item.residual_risk_level,
        status=item.status,
        reviewed_at=item.reviewed_at,
        review_due_at=item.review_due_at,
        approved_at=item.approved_at,
        approval_notes=item.approval_notes,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("/library", response_model=Page[HazardCatalogItemOut])
def list_hazard_library(
    hazard_group: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("RISK_INVENTORY")),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER, ROLE_TENANT_AUDITOR])),
):
    base = db.query(HazardCatalogItem).filter(HazardCatalogItem.is_active == True)
    if hazard_group:
        base = base.filter(HazardCatalogItem.hazard_group == hazard_group)
    if q:
        like = f"%{q.strip()}%"
        base = base.filter((HazardCatalogItem.name.ilike(like)) | (HazardCatalogItem.code.ilike(like)))
    total = base.count()
    rows = base.order_by(HazardCatalogItem.hazard_group.asc(), HazardCatalogItem.name.asc()).offset(offset).limit(limit).all()
    return Page(items=[HazardCatalogItemOut(**{
        'id': r.id, 'code': r.code, 'hazard_group': r.hazard_group, 'name': r.name,
        'description': r.description, 'legal_basis': r.legal_basis,
        'control_suggestions': r.control_suggestions or [],
        'default_evidence_requirements': r.default_evidence_requirements or [],
        'is_active': r.is_active, 'created_at': r.created_at, 'updated_at': r.updated_at,
    }) for r in rows], total=total, limit=limit, offset=offset)


@router.get("/items", response_model=Page[RiskInventoryItemOut])
def list_inventory_items(
    cnpj_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    hazard_group: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("RISK_INVENTORY")),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER, ROLE_TENANT_AUDITOR])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    base = db.query(RiskInventoryItem).filter(RiskInventoryItem.tenant_id == tenant_id)
    if cnpj_id:
        base = base.filter(RiskInventoryItem.cnpj_id == cnpj_id)
    if org_unit_id:
        base = base.filter(RiskInventoryItem.org_unit_id == org_unit_id)
    if hazard_group:
        base = base.filter(RiskInventoryItem.hazard_group == hazard_group)
    if status:
        base = base.filter(RiskInventoryItem.status == status)
    total = base.count()
    rows = base.order_by(RiskInventoryItem.updated_at.desc()).offset(offset).limit(limit).all()
    return Page(items=[_out(r) for r in rows], total=total, limit=limit, offset=offset)


@router.post("/items", response_model=RiskInventoryItemOut)
def create_inventory_item(
    payload: RiskInventoryItemCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("RISK_INVENTORY")),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    if payload.org_unit_id:
        unit = db.query(OrgUnit).filter(OrgUnit.id == payload.org_unit_id, OrgUnit.tenant_id == tenant_id, OrgUnit.cnpj_id == payload.cnpj_id).first()
        if not unit:
            raise BadRequest("org_unit_id inválido para o CNPJ informado")
    risk_score, risk_level = _calc_level(payload.severity, payload.probability)
    residual_score = residual_level = None
    if payload.residual_severity and payload.residual_probability:
        residual_score, residual_level = _calc_level(payload.residual_severity, payload.residual_probability)
    item = RiskInventoryItem(
        tenant_id=tenant_id,
        cnpj_id=payload.cnpj_id,
        org_unit_id=payload.org_unit_id,
        catalog_item_id=payload.catalog_item_id,
        created_by_user_id=user.id,
        process_name=payload.process_name,
        activity_name=payload.activity_name,
        position_name=payload.position_name,
        hazard_group=payload.hazard_group,
        hazard_name=payload.hazard_name,
        source_or_circumstance=payload.source_or_circumstance,
        possible_damage=payload.possible_damage,
        exposed_workers=payload.exposed_workers,
        exposure_notes=payload.exposure_notes,
        existing_controls=payload.existing_controls,
        proposed_controls=payload.proposed_controls,
        evidence_requirements=payload.evidence_requirements,
        traceability=payload.traceability,
        severity=payload.severity,
        probability=payload.probability,
        risk_score=risk_score,
        risk_level=risk_level,
        residual_severity=payload.residual_severity,
        residual_probability=payload.residual_probability,
        residual_risk_score=residual_score,
        residual_risk_level=residual_level,
        review_due_at=payload.review_due_at,
        status="draft",
    )
    db.add(item)
    db.flush()
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "inventory_item_created", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="inventory", properties={"hazard_group": item.hazard_group, "risk_level": item.risk_level, "has_org_unit": bool(item.org_unit_id)})
    db.add(make_audit_event(tenant_id, user.id, "CREATE", "RISK_INVENTORY_ITEM", item.id, None, {"hazard_group": item.hazard_group, "hazard_name": item.hazard_name, "risk_level": item.risk_level}, meta.get("ip"), meta.get("user_agent"), meta.get("request_id")))
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit(); db.refresh(item)
    return _out(item)


@router.put("/items/{item_id}", response_model=RiskInventoryItemOut)
def update_inventory_item(
    item_id: UUID,
    payload: RiskInventoryItemUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("RISK_INVENTORY")),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    item = db.query(RiskInventoryItem).filter(RiskInventoryItem.id == item_id, RiskInventoryItem.tenant_id == tenant_id).first()
    if not item:
        raise NotFound("Item do inventário não encontrado")
    before = {"risk_level": item.risk_level, "status": item.status}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.reviewed_at = datetime.utcnow()
    item.risk_score, item.risk_level = _calc_level(item.severity, item.probability)
    if item.residual_severity and item.residual_probability:
        item.residual_risk_score, item.residual_risk_level = _calc_level(item.residual_severity, item.residual_probability)
    db.add(item)
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "inventory_item_reviewed", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="inventory", properties={"risk_level": item.risk_level, "status": item.status})
    db.add(make_audit_event(tenant_id, user.id, "UPDATE", "RISK_INVENTORY_ITEM", item.id, before, {"risk_level": item.risk_level, "status": item.status}, meta.get("ip"), meta.get("user_agent"), meta.get("request_id")))
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit(); db.refresh(item)
    return _out(item)


@router.post("/items/{item_id}/approve", response_model=RiskInventoryItemOut)
def approve_inventory_item(
    item_id: UUID,
    payload: InventoryApprovePayload,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("RISK_INVENTORY")),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    item = db.query(RiskInventoryItem).filter(RiskInventoryItem.id == item_id, RiskInventoryItem.tenant_id == tenant_id).first()
    if not item:
        raise NotFound("Item do inventário não encontrado")
    before = {"status": item.status, "approved_at": item.approved_at.isoformat() if item.approved_at else None}
    item.status = "approved"
    item.approved_at = datetime.utcnow()
    item.approved_by_user_id = user.id
    item.approval_notes = payload.approval_notes
    item.reviewed_at = datetime.utcnow()
    db.add(item)
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "inventory_item_approved", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="inventory", properties={"risk_level": item.risk_level, "status": item.status})
    db.add(make_audit_event(tenant_id, user.id, "APPROVE", "RISK_INVENTORY_ITEM", item.id, before, {"status": item.status}, meta.get("ip"), meta.get("user_agent"), meta.get("request_id")))
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit(); db.refresh(item)
    return _out(item)
