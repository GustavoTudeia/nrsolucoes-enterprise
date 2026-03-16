from __future__ import annotations

from datetime import datetime, timedelta
from hashlib import sha256
import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import (
    get_request_meta,
    require_active_subscription,
    require_any_role,
    require_feature,
    tenant_id_from_user,
)
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, NotFound
from app.core.rbac import ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_TENANT_AUDITOR, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.db.session import get_db
from app.models.inventory import RiskInventoryItem
from app.models.org import CNPJ, OrgUnit
from app.models.pgr_governance import PGRDocumentApproval, ErgonomicAssessment
from app.schemas.common import Page
from app.services.analytics_service import capture_analytics_event
from app.services.tenant_health import upsert_tenant_health_snapshot
from app.schemas.pgr_governance import (
    ErgonomicAssessmentApprove,
    ErgonomicAssessmentCreate,
    ErgonomicAssessmentOut,
    ErgonomicAssessmentUpdate,
    PGRDocumentApprovalCreate,
    PGRDocumentApprovalOut,
)

router = APIRouter(prefix="/pgr")


def _approval_out(row: PGRDocumentApproval) -> PGRDocumentApprovalOut:
    return PGRDocumentApprovalOut(
        id=row.id,
        tenant_id=row.tenant_id,
        cnpj_id=row.cnpj_id,
        org_unit_id=row.org_unit_id,
        document_scope=row.document_scope,
        version_label=row.version_label,
        status=row.status,
        statement=row.statement,
        notes=row.notes,
        approver_name=row.approver_name,
        approver_role=row.approver_role,
        approver_email=row.approver_email,
        effective_from=row.effective_from,
        review_due_at=row.review_due_at,
        approved_at=row.approved_at,
        inventory_item_count=row.inventory_item_count,
        snapshot_hash=row.snapshot_hash,
        snapshot_json=row.snapshot_json or {},
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _ergo_out(row: ErgonomicAssessment) -> ErgonomicAssessmentOut:
    return ErgonomicAssessmentOut(
        id=row.id,
        tenant_id=row.tenant_id,
        cnpj_id=row.cnpj_id,
        org_unit_id=row.org_unit_id,
        assessment_type=row.assessment_type,
        title=row.title,
        status=row.status,
        process_name=row.process_name,
        activity_name=row.activity_name,
        position_name=row.position_name,
        workstation_name=row.workstation_name,
        demand_summary=row.demand_summary,
        conditions_summary=row.conditions_summary,
        psychosocial_factors=row.psychosocial_factors or [],
        findings=row.findings or [],
        recommendations=row.recommendations or [],
        traceability=row.traceability or {},
        reviewed_at=row.reviewed_at,
        review_due_at=row.review_due_at,
        approved_at=row.approved_at,
        approval_notes=row.approval_notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


@router.get(
    "/approvals",
    response_model=Page[PGRDocumentApprovalOut],
    dependencies=[Depends(require_active_subscription), Depends(require_feature("RISK_INVENTORY"))],
)
def list_pgr_approvals(
    cnpj_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_TENANT_AUDITOR])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    q = db.query(PGRDocumentApproval).filter(PGRDocumentApproval.tenant_id == tenant_id)
    if cnpj_id:
        q = q.filter(PGRDocumentApproval.cnpj_id == cnpj_id)
    if org_unit_id:
        q = q.filter(PGRDocumentApproval.org_unit_id == org_unit_id)
    if status:
        q = q.filter(PGRDocumentApproval.status == status)
    total = q.count()
    rows = q.order_by(PGRDocumentApproval.approved_at.desc()).offset(offset).limit(limit).all()
    return Page(items=[_approval_out(r) for r in rows], total=total, limit=limit, offset=offset)


@router.post(
    "/approvals",
    response_model=PGRDocumentApprovalOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("RISK_INVENTORY"))],
)
def create_pgr_approval(
    payload: PGRDocumentApprovalCreate,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    cnpj = db.query(CNPJ).filter(CNPJ.id == payload.cnpj_id, CNPJ.tenant_id == tenant_id).first()
    if not cnpj:
        raise BadRequest("cnpj_id inválido")
    if payload.org_unit_id:
        unit = db.query(OrgUnit).filter(OrgUnit.id == payload.org_unit_id, OrgUnit.tenant_id == tenant_id, OrgUnit.cnpj_id == payload.cnpj_id).first()
        if not unit:
            raise BadRequest("org_unit_id inválido para o CNPJ informado")

    items_q = db.query(RiskInventoryItem).filter(
        RiskInventoryItem.tenant_id == tenant_id,
        RiskInventoryItem.cnpj_id == payload.cnpj_id,
        RiskInventoryItem.status == "approved",
    )
    if payload.org_unit_id:
        items_q = items_q.filter(RiskInventoryItem.org_unit_id == payload.org_unit_id)
    approved_items = items_q.order_by(
        RiskInventoryItem.hazard_group.asc(),
        RiskInventoryItem.process_name.asc(),
        RiskInventoryItem.activity_name.asc(),
        RiskInventoryItem.hazard_name.asc(),
    ).all()
    if not approved_items:
        raise BadRequest("Aprovação formal exige ao menos um item do inventário com status 'approved'")

    effective_from = payload.effective_from or datetime.utcnow()
    review_due_at = payload.review_due_at or (effective_from + timedelta(days=365))
    statement = payload.statement or (
        "A presente versão consolida o inventário de perigos e riscos e o plano de governança associado, "
        "mantendo rastreabilidade, evidências e responsabilidade de revisão nos termos da NR-1."
    )

    snapshot = {
        "scope": {
            "tenant_id": str(tenant_id),
            "cnpj_id": str(payload.cnpj_id),
            "org_unit_id": str(payload.org_unit_id) if payload.org_unit_id else None,
            "document_scope": payload.document_scope,
        },
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "items": [
            {
                "id": str(item.id),
                "hazard_group": item.hazard_group,
                "hazard_name": item.hazard_name,
                "process_name": item.process_name,
                "activity_name": item.activity_name,
                "position_name": item.position_name,
                "source_or_circumstance": item.source_or_circumstance,
                "possible_damage": item.possible_damage,
                "existing_controls": item.existing_controls or [],
                "proposed_controls": item.proposed_controls or [],
                "evidence_requirements": item.evidence_requirements or [],
                "severity": item.severity,
                "probability": item.probability,
                "risk_score": item.risk_score,
                "risk_level": item.risk_level,
                "residual_risk_score": item.residual_risk_score,
                "residual_risk_level": item.residual_risk_level,
                "review_due_at": item.review_due_at.isoformat() if item.review_due_at else None,
                "approved_at": item.approved_at.isoformat() if item.approved_at else None,
            }
            for item in approved_items
        ],
    }
    snapshot_hash = sha256(json.dumps(snapshot, sort_keys=True, default=str).encode("utf-8")).hexdigest()

    scope_q = db.query(PGRDocumentApproval).filter(
        PGRDocumentApproval.tenant_id == tenant_id,
        PGRDocumentApproval.cnpj_id == payload.cnpj_id,
        PGRDocumentApproval.document_scope == payload.document_scope,
        PGRDocumentApproval.status == "active",
    )
    if payload.org_unit_id:
        scope_q = scope_q.filter(PGRDocumentApproval.org_unit_id == payload.org_unit_id)
    else:
        scope_q = scope_q.filter(PGRDocumentApproval.org_unit_id.is_(None))
    previous = scope_q.order_by(PGRDocumentApproval.approved_at.desc()).all()
    version_label = payload.version_label or f"{payload.document_scope.upper()}-{len(previous) + 1:03d}"

    approval = PGRDocumentApproval(
        tenant_id=tenant_id,
        cnpj_id=payload.cnpj_id,
        org_unit_id=payload.org_unit_id,
        approved_by_user_id=user.id,
        document_scope=payload.document_scope,
        version_label=version_label,
        status="active",
        statement=statement,
        notes=payload.notes,
        approver_name=getattr(user, "display_name", None) or getattr(user, "full_name", None) or getattr(user, "email", None) or "Responsável",
        approver_role=(user.roles[0].role.name if getattr(user, "roles", None) and user.roles and user.roles[0].role else None),
        approver_email=getattr(user, "email", None),
        effective_from=effective_from,
        review_due_at=review_due_at,
        approved_at=datetime.utcnow(),
        inventory_item_count=len(approved_items),
        snapshot_hash=snapshot_hash,
        snapshot_json=snapshot,
    )
    db.add(approval)
    db.flush()
    for prev in previous:
        prev.status = "superseded"
        prev.superseded_by_id = approval.id
        db.add(prev)

    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "pgr_formalized", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="pgr", properties={"document_scope": approval.document_scope, "inventory_item_count": approval.inventory_item_count, "version_label": approval.version_label})
    db.add(make_audit_event(
        tenant_id, user.id, "APPROVE", "PGR_DOCUMENT_APPROVAL", approval.id,
        None,
        {"version_label": approval.version_label, "snapshot_hash": approval.snapshot_hash, "inventory_item_count": approval.inventory_item_count},
        meta.get("ip"), meta.get("user_agent"), meta.get("request_id")
    ))
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit()
    db.refresh(approval)
    return _approval_out(approval)


@router.get(
    "/ergonomics",
    response_model=Page[ErgonomicAssessmentOut],
    dependencies=[Depends(require_active_subscription), Depends(require_feature("NR17"))],
)
def list_ergonomics(
    cnpj_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    assessment_type: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER, ROLE_TENANT_AUDITOR])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    q = db.query(ErgonomicAssessment).filter(ErgonomicAssessment.tenant_id == tenant_id)
    if cnpj_id:
        q = q.filter(ErgonomicAssessment.cnpj_id == cnpj_id)
    if org_unit_id:
        q = q.filter(ErgonomicAssessment.org_unit_id == org_unit_id)
    if assessment_type:
        q = q.filter(ErgonomicAssessment.assessment_type == assessment_type)
    if status:
        q = q.filter(ErgonomicAssessment.status == status)
    total = q.count()
    rows = q.order_by(ErgonomicAssessment.updated_at.desc()).offset(offset).limit(limit).all()
    return Page(items=[_ergo_out(r) for r in rows], total=total, limit=limit, offset=offset)


@router.post(
    "/ergonomics",
    response_model=ErgonomicAssessmentOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("NR17"))],
)
def create_ergonomic_assessment(
    payload: ErgonomicAssessmentCreate,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    cnpj = db.query(CNPJ).filter(CNPJ.id == payload.cnpj_id, CNPJ.tenant_id == tenant_id).first()
    if not cnpj:
        raise BadRequest("cnpj_id inválido")
    if payload.org_unit_id:
        unit = db.query(OrgUnit).filter(OrgUnit.id == payload.org_unit_id, OrgUnit.tenant_id == tenant_id, OrgUnit.cnpj_id == payload.cnpj_id).first()
        if not unit:
            raise BadRequest("org_unit_id inválido para o CNPJ informado")
    if payload.assessment_type not in {"AEP", "AET"}:
        raise BadRequest("assessment_type deve ser AEP ou AET")
    row = ErgonomicAssessment(
        tenant_id=tenant_id,
        cnpj_id=payload.cnpj_id,
        org_unit_id=payload.org_unit_id,
        created_by_user_id=user.id,
        assessment_type=payload.assessment_type,
        title=payload.title,
        process_name=payload.process_name,
        activity_name=payload.activity_name,
        position_name=payload.position_name,
        workstation_name=payload.workstation_name,
        demand_summary=payload.demand_summary,
        conditions_summary=payload.conditions_summary,
        psychosocial_factors=payload.psychosocial_factors,
        findings=payload.findings,
        recommendations=payload.recommendations,
        traceability=payload.traceability,
        review_due_at=payload.review_due_at,
        status="draft",
    )
    db.add(row)
    db.flush()
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "ergonomics_assessment_created", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="ergonomics", properties={"assessment_type": row.assessment_type, "title": row.title})
    db.add(make_audit_event(tenant_id, user.id, "CREATE", "ERGONOMIC_ASSESSMENT", row.id, None, {"assessment_type": row.assessment_type, "title": row.title}, meta.get("ip"), meta.get("user_agent"), meta.get("request_id")))
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit(); db.refresh(row)
    return _ergo_out(row)


@router.put(
    "/ergonomics/{assessment_id}",
    response_model=ErgonomicAssessmentOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("NR17"))],
)
def update_ergonomic_assessment(
    assessment_id: UUID,
    payload: ErgonomicAssessmentUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    row = db.query(ErgonomicAssessment).filter(ErgonomicAssessment.id == assessment_id, ErgonomicAssessment.tenant_id == tenant_id).first()
    if not row:
        raise NotFound("Avaliação ergonômica não encontrada")
    before = {"status": row.status, "approved_at": row.approved_at.isoformat() if row.approved_at else None}
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    row.reviewed_at = datetime.utcnow()
    db.add(row)
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "ergonomics_reassessment_completed", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="ergonomics", properties={"assessment_type": row.assessment_type, "status": row.status})
    db.add(make_audit_event(tenant_id, user.id, "UPDATE", "ERGONOMIC_ASSESSMENT", row.id, before, {"status": row.status}, meta.get("ip"), meta.get("user_agent"), meta.get("request_id")))
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit(); db.refresh(row)
    return _ergo_out(row)


@router.post(
    "/ergonomics/{assessment_id}/approve",
    response_model=ErgonomicAssessmentOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("NR17"))],
)
def approve_ergonomic_assessment(
    assessment_id: UUID,
    payload: ErgonomicAssessmentApprove,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_OWNER, ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    row = db.query(ErgonomicAssessment).filter(ErgonomicAssessment.id == assessment_id, ErgonomicAssessment.tenant_id == tenant_id).first()
    if not row:
        raise NotFound("Avaliação ergonômica não encontrada")
    row.status = "approved"
    row.approved_at = datetime.utcnow()
    row.approved_by_user_id = user.id
    row.approval_notes = payload.approval_notes
    row.reviewed_at = datetime.utcnow()
    db.add(row)
    actor_role = (user.roles[0].role.key if getattr(user, "roles", None) and user.roles and user.roles[0].role else None)
    capture_analytics_event(db, "ergonomics_aep_completed" if row.assessment_type == "AEP" else "ergonomics_aet_completed", source="backend", tenant_id=tenant_id, user_id=user.id, actor_role=actor_role, module="ergonomics", properties={"assessment_type": row.assessment_type, "status": row.status})
    db.add(make_audit_event(tenant_id, user.id, "APPROVE", "ERGONOMIC_ASSESSMENT", row.id, None, {"status": row.status, "assessment_type": row.assessment_type}, meta.get("ip"), meta.get("user_agent"), meta.get("request_id")))
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit(); db.refresh(row)
    return _ergo_out(row)
