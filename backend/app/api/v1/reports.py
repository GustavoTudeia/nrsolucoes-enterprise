from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import (
    require_any_role,
    tenant_id_from_user,
    require_active_subscription,
)
from app.core.rbac import (
    ROLE_OWNER,
    ROLE_TENANT_ADMIN,
    ROLE_TENANT_AUDITOR,
    ROLE_CNPJ_MANAGER,
    ROLE_UNIT_MANAGER,
)
from app.db.session import get_db
from app.models.action_plan import ActionPlan, ActionItem
from app.models.audit_event import AuditEvent
from app.models.campaign import Campaign, SurveyResponse
from app.models.employee import Employee
from app.models.org import CNPJ, OrgUnit
from app.models.risk import RiskAssessment
from app.models.tenant import TenantSettings

router = APIRouter(prefix="/reports")


@router.get("/overview")
def tenant_overview(
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _user=Depends(
        require_any_role(
            [
                ROLE_OWNER,
                ROLE_TENANT_ADMIN,
                ROLE_TENANT_AUDITOR,
                ROLE_CNPJ_MANAGER,
                ROLE_UNIT_MANAGER,
            ]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Resumo executivo do tenant para o Dashboard.

    Observação: este endpoint devolve métricas agregadas (sem PII).
    """

    settings = (
        db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    )
    min_n = settings.min_anon_threshold if settings else 5

    cnpjs = (
        db.query(func.count(CNPJ.id))
        .filter(CNPJ.tenant_id == tenant_id, CNPJ.is_active == True)
        .scalar()
        or 0
    )
    units = (
        db.query(func.count(OrgUnit.id))
        .join(CNPJ, OrgUnit.cnpj_id == CNPJ.id)
        .filter(CNPJ.tenant_id == tenant_id, OrgUnit.is_active == True)
        .scalar()
        or 0
    )
    employees = (
        db.query(func.count(Employee.id))
        .filter(Employee.tenant_id == tenant_id)
        .scalar()
        or 0
    )

    campaigns_total = (
        db.query(func.count(Campaign.id))
        .filter(Campaign.tenant_id == tenant_id)
        .scalar()
        or 0
    )
    campaigns_open = (
        db.query(func.count(Campaign.id))
        .filter(Campaign.tenant_id == tenant_id, Campaign.status == "open")
        .scalar()
        or 0
    )
    campaigns_closed = (
        db.query(func.count(Campaign.id))
        .filter(Campaign.tenant_id == tenant_id, Campaign.status == "closed")
        .scalar()
        or 0
    )
    campaigns_draft = (
        db.query(func.count(Campaign.id))
        .filter(Campaign.tenant_id == tenant_id, Campaign.status == "draft")
        .scalar()
        or 0
    )

    responses_total = (
        db.query(func.count(SurveyResponse.id))
        .filter(SurveyResponse.tenant_id == tenant_id)
        .scalar()
        or 0
    )

    # Risks distribution (latest snapshot across all)
    risks_total = (
        db.query(func.count(RiskAssessment.id))
        .filter(RiskAssessment.tenant_id == tenant_id)
        .scalar()
        or 0
    )
    risks_high = (
        db.query(func.count(RiskAssessment.id))
        .filter(RiskAssessment.tenant_id == tenant_id, RiskAssessment.level == "high")
        .scalar()
        or 0
    )
    risks_med = (
        db.query(func.count(RiskAssessment.id))
        .filter(RiskAssessment.tenant_id == tenant_id, RiskAssessment.level == "medium")
        .scalar()
        or 0
    )
    risks_low = (
        db.query(func.count(RiskAssessment.id))
        .filter(RiskAssessment.tenant_id == tenant_id, RiskAssessment.level == "low")
        .scalar()
        or 0
    )

    items_total = (
        db.query(func.count(ActionItem.id))
        .filter(ActionItem.tenant_id == tenant_id)
        .scalar()
        or 0
    )
    items_planned = (
        db.query(func.count(ActionItem.id))
        .filter(ActionItem.tenant_id == tenant_id, ActionItem.status == "planned")
        .scalar()
        or 0
    )
    items_in_progress = (
        db.query(func.count(ActionItem.id))
        .filter(ActionItem.tenant_id == tenant_id, ActionItem.status == "in_progress")
        .scalar()
        or 0
    )
    items_done = (
        db.query(func.count(ActionItem.id))
        .filter(ActionItem.tenant_id == tenant_id, ActionItem.status == "done")
        .scalar()
        or 0
    )

    last_audit = (
        db.query(AuditEvent)
        .filter(AuditEvent.tenant_id == tenant_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(1)
        .first()
    )

    # Readiness heuristic: these are product heuristics (not legal advice)
    readiness = {
        "org_structure": cnpjs > 0 and (units > 0 or employees > 0),
        "diagnostic": campaigns_total > 0 and responses_total >= min_n,
        "risk": risks_total > 0,
        "action_plan": items_total > 0,
    }
    readiness["overall"] = all(readiness.values())

    return {
        "tenant_id": str(tenant_id),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "lgpd": {"min_anon_threshold": min_n},
        "counts": {
            "cnpjs": cnpjs,
            "org_units": units,
            "employees": employees,
            "campaigns": campaigns_total,
            "responses": responses_total,
            "risk_assessments": risks_total,
            "action_items": items_total,
        },
        "campaigns": {
            "draft": campaigns_draft,
            "open": campaigns_open,
            "closed": campaigns_closed,
        },
        "risks": {"low": risks_low, "medium": risks_med, "high": risks_high},
        "actions": {
            "planned": items_planned,
            "in_progress": items_in_progress,
            "done": items_done,
        },
        "audit": {
            "last_event_at": (
                (last_audit.created_at.isoformat() + "Z") if last_audit else None
            )
        },
        "readiness": readiness,
    }


@router.get("/pgr-dossier")
def pgr_dossier(
    cnpj_id: Optional[UUID] = Query(default=None),
    campaign_id: Optional[UUID] = Query(default=None),
    limit_audit: int = Query(default=100, ge=0, le=500),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _user=Depends(
        require_any_role(
            [
                ROLE_OWNER,
                ROLE_TENANT_ADMIN,
                ROLE_TENANT_AUDITOR,
                ROLE_CNPJ_MANAGER,
                ROLE_UNIT_MANAGER,
            ]
        )
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Dossiê estruturado (JSON) para geração de PDF/print no frontend.

    Inclui: estrutura (CNPJ/unidades), campanhas, agregados (se liberado por LGPD),
    avaliações de risco, planos de ação/itens/evidências e eventos de auditoria.
    """

    settings = (
        db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    )
    min_n = settings.min_anon_threshold if settings else 5

    # Structure
    cnpj_q = db.query(CNPJ).filter(CNPJ.tenant_id == tenant_id)
    if cnpj_id:
        cnpj_q = cnpj_q.filter(CNPJ.id == cnpj_id)
    cnpj_rows = cnpj_q.order_by(CNPJ.legal_name.asc()).all()

    cnpj_map = {str(c.id): c for c in cnpj_rows}
    units_q = (
        db.query(OrgUnit)
        .join(CNPJ, OrgUnit.cnpj_id == CNPJ.id)
        .filter(CNPJ.tenant_id == tenant_id)
    )
    if cnpj_id:
        units_q = units_q.filter(OrgUnit.cnpj_id == cnpj_id)
    units_rows = units_q.order_by(OrgUnit.name.asc()).all()
    unit_name = {str(u.id): u.name for u in units_rows}

    # Campaigns
    camp_q = db.query(Campaign).filter(Campaign.tenant_id == tenant_id)
    if cnpj_id:
        camp_q = camp_q.filter(Campaign.cnpj_id == cnpj_id)
    if campaign_id:
        camp_q = camp_q.filter(Campaign.id == campaign_id)
    camp_rows = camp_q.order_by(Campaign.created_at.desc()).all()

    # Responses counts per campaign
    resp_counts = {
        str(cid): (
            db.query(func.count(SurveyResponse.id))
            .filter(SurveyResponse.campaign_id == cid)
            .scalar()
            or 0
        )
        for cid in [c.id for c in camp_rows]
    }

    # Risks
    risk_q = db.query(RiskAssessment).filter(RiskAssessment.tenant_id == tenant_id)
    if cnpj_id:
        risk_q = risk_q.filter(RiskAssessment.cnpj_id == cnpj_id)
    if campaign_id:
        risk_q = risk_q.filter(RiskAssessment.campaign_id == campaign_id)
    risks = risk_q.order_by(RiskAssessment.assessed_at.desc()).limit(500).all()

    risk_ids = [r.id for r in risks]
    plans = (
        db.query(ActionPlan)
        .filter(ActionPlan.tenant_id == tenant_id)
        .filter(ActionPlan.risk_assessment_id.in_(risk_ids) if risk_ids else True)
        .options(joinedload(ActionPlan.items).joinedload(ActionItem.evidences))
        .all()
    )

    audit_events = (
        db.query(AuditEvent)
        .filter(AuditEvent.tenant_id == tenant_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(limit_audit)
        .all()
    )

    return {
        "tenant_id": str(tenant_id),
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "lgpd": {"min_anon_threshold": min_n},
        "structure": {
            "cnpjs": [
                {
                    "id": str(c.id),
                    "legal_name": c.legal_name,
                    "trade_name": c.trade_name,
                    "cnpj_number": c.cnpj_number,
                    "is_active": c.is_active,
                }
                for c in cnpj_rows
            ],
            "org_units": [
                {
                    "id": str(u.id),
                    "cnpj_id": str(u.cnpj_id),
                    "name": u.name,
                    "unit_type": u.unit_type,
                    "parent_unit_id": (
                        str(u.parent_unit_id) if u.parent_unit_id else None
                    ),
                    "is_active": u.is_active,
                }
                for u in units_rows
            ],
        },
        "campaigns": [
            {
                "id": str(c.id),
                "name": c.name,
                "status": c.status,
                "cnpj_id": str(c.cnpj_id),
                "cnpj_legal_name": (
                    cnpj_map.get(str(c.cnpj_id)).legal_name
                    if cnpj_map.get(str(c.cnpj_id))
                    else None
                ),
                "org_unit_id": str(c.org_unit_id) if c.org_unit_id else None,
                "org_unit_name": (
                    unit_name.get(str(c.org_unit_id)) if c.org_unit_id else None
                ),
                "questionnaire_version_id": str(c.questionnaire_version_id),
                "created_at": c.created_at.isoformat() + "Z",
                "opened_at": (c.opened_at.isoformat() + "Z") if c.opened_at else None,
                "closed_at": (c.closed_at.isoformat() + "Z") if c.closed_at else None,
                "responses": resp_counts.get(str(c.id), 0),
                "aggregation_allowed": resp_counts.get(str(c.id), 0) >= min_n,
            }
            for c in camp_rows
        ],
        "risks": [
            {
                "id": str(r.id),
                "campaign_id": str(r.campaign_id),
                "cnpj_id": str(r.cnpj_id),
                "org_unit_id": str(r.org_unit_id) if r.org_unit_id else None,
                "score": r.score,
                "level": r.level,
                "dimension_scores": r.dimension_scores,
                "assessed_at": r.assessed_at.isoformat() + "Z",
            }
            for r in risks
        ],
        "action_plans": [
            {
                "id": str(p.id),
                "risk_assessment_id": str(p.risk_assessment_id),
                "status": p.status,
                "version": p.version,
                "created_at": p.created_at.isoformat() + "Z",
                "items": [
                    {
                        "id": str(i.id),
                        "item_type": i.item_type,
                        "title": i.title,
                        "description": i.description,
                        "responsible": i.responsible,
                        "due_date": (
                            i.due_date.isoformat() + "Z" if i.due_date else None
                        ),
                        "status": i.status,
                        "education_ref_type": i.education_ref_type,
                        "education_ref_id": (
                            str(i.education_ref_id) if i.education_ref_id else None
                        ),
                        "created_at": i.created_at.isoformat() + "Z",
                        "evidences": [
                            {
                                "id": str(e.id),
                                "evidence_type": e.evidence_type,
                                "reference": e.reference,
                                "note": e.note,
                                "created_at": e.created_at.isoformat() + "Z",
                            }
                            for e in (i.evidences or [])
                        ],
                    }
                    for i in (p.items or [])
                ],
            }
            for p in plans
        ],
        "audit": [
            {
                "id": str(e.id),
                "created_at": e.created_at.isoformat() + "Z",
                "action": e.action,
                "entity_type": e.entity_type,
                "entity_id": str(e.entity_id) if e.entity_id else None,
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
                "ip": e.ip,
                "request_id": e.request_id,
            }
            for e in audit_events
        ],
    }
