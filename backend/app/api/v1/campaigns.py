from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_any_role, tenant_id_from_user, get_request_meta, require_active_subscription
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, NotFound, Forbidden
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.db.session import get_db
from sqlalchemy import func as sa_func
from app.models.campaign import Campaign, SurveyResponse
from app.models.org import OrgUnit
from app.models.questionnaire import QuestionnaireVersion
from app.models.tenant import TenantSettings
from app.schemas.campaign import CampaignCreate, CampaignOut, CampaignDetailOut, SurveyResponseSubmit
from app.schemas.common import Page
from app.services.plan_limits import enforce_limit, month_range
from app.services.risk_engine import compute_dimension_scores

router = APIRouter(prefix="/campaigns")


@router.get("", response_model=Page[CampaignDetailOut])
def list_campaigns(
    status: Optional[str] = Query(default=None, description="draft|open|closed"),
    cnpj_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    questionnaire_version_id: Optional[UUID] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Busca por nome"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    base = db.query(Campaign).filter(Campaign.tenant_id == tenant_id)
    if status:
        base = base.filter(Campaign.status == status)
    if cnpj_id:
        base = base.filter(Campaign.cnpj_id == cnpj_id)
    if org_unit_id:
        base = base.filter(Campaign.org_unit_id == org_unit_id)
    if questionnaire_version_id:
        base = base.filter(Campaign.questionnaire_version_id == questionnaire_version_id)
    if q:
        like = f"%{q.strip()}%"
        base = base.filter(Campaign.name.ilike(like))

    total = base.count()
    rows = base.order_by(Campaign.created_at.desc()).offset(offset).limit(limit).all()

    # Batch response counts
    campaign_ids = [r.id for r in rows]
    resp_counts: dict = {}
    if campaign_ids:
        counts = (
            db.query(SurveyResponse.campaign_id, sa_func.count(SurveyResponse.id))
            .filter(SurveyResponse.campaign_id.in_(campaign_ids))
            .group_by(SurveyResponse.campaign_id)
            .all()
        )
        resp_counts = {cid: cnt for cid, cnt in counts}

    # Batch org unit names
    unit_ids = {r.org_unit_id for r in rows if r.org_unit_id}
    unit_names: dict = {}
    if unit_ids:
        units = db.query(OrgUnit.id, OrgUnit.name).filter(OrgUnit.id.in_(list(unit_ids))).all()
        unit_names = {u.id: u.name for u in units}

    items = [
        CampaignDetailOut(
            id=r.id,
            tenant_id=r.tenant_id,
            name=r.name,
            cnpj_id=r.cnpj_id,
            org_unit_id=r.org_unit_id,
            org_unit_name=unit_names.get(r.org_unit_id) if r.org_unit_id else None,
            questionnaire_version_id=r.questionnaire_version_id,
            status=r.status,
            response_count=resp_counts.get(r.id, 0),
            created_at=r.created_at,
            opened_at=r.opened_at,
            closed_at=r.closed_at,
        )
        for r in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{campaign_id}", response_model=CampaignDetailOut)
def get_campaign(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id).first()
    if not camp:
        raise NotFound("Campanha não encontrada")
    resp_count = db.query(sa_func.count(SurveyResponse.id)).filter(SurveyResponse.campaign_id == camp.id).scalar() or 0
    unit_name = None
    if camp.org_unit_id:
        unit = db.query(OrgUnit.name).filter(OrgUnit.id == camp.org_unit_id).first()
        unit_name = unit.name if unit else None
    return CampaignDetailOut(
        id=camp.id,
        tenant_id=camp.tenant_id,
        name=camp.name,
        cnpj_id=camp.cnpj_id,
        org_unit_id=camp.org_unit_id,
        org_unit_name=unit_name,
        questionnaire_version_id=camp.questionnaire_version_id,
        status=camp.status,
        response_count=resp_count,
        created_at=camp.created_at,
        opened_at=camp.opened_at,
        closed_at=camp.closed_at,
    )


@router.post("", response_model=CampaignOut)
def create_campaign(
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    qv = db.query(QuestionnaireVersion).filter(QuestionnaireVersion.id == payload.questionnaire_version_id).first()
    if not qv or qv.status != "published":
        raise BadRequest("Questionário deve estar publicado")

    now = datetime.utcnow()
    start, end = month_range(now)
    current = (
        db.query(Campaign)
        .filter(Campaign.tenant_id == tenant_id, Campaign.created_at >= start, Campaign.created_at < end)
        .count()
    )
    enforce_limit(db, tenant_id, "campaigns_per_month", current, 1)

    camp = Campaign(
        tenant_id=tenant_id,
        name=payload.name,
        cnpj_id=payload.cnpj_id,
        org_unit_id=payload.org_unit_id,
        questionnaire_version_id=payload.questionnaire_version_id,
        status="draft",
    )
    db.add(camp)
    db.flush()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "CAMPAIGN",
            camp.id,
            None,
            {"name": camp.name},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(camp)
    return CampaignOut(
        id=camp.id,
        name=camp.name,
        cnpj_id=camp.cnpj_id,
        org_unit_id=camp.org_unit_id,
        questionnaire_version_id=camp.questionnaire_version_id,
        status=camp.status,
    )


@router.post("/{campaign_id}/open", response_model=CampaignOut)
def open_campaign(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    user = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id).first()
    if not camp:
        raise NotFound("Campanha não encontrada")
    camp.status = "open"
    camp.opened_at = datetime.utcnow()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "UPDATE",
            "CAMPAIGN",
            camp.id,
            None,
            {"status": "open"},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(camp)
    return CampaignOut(
        id=camp.id,
        name=camp.name,
        cnpj_id=camp.cnpj_id,
        org_unit_id=camp.org_unit_id,
        questionnaire_version_id=camp.questionnaire_version_id,
        status=camp.status,
    )


@router.post("/{campaign_id}/close", response_model=CampaignOut)
def close_campaign(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    user = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id).first()
    if not camp:
        raise NotFound("Campanha não encontrada")
    camp.status = "closed"
    camp.closed_at = datetime.utcnow()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "UPDATE",
            "CAMPAIGN",
            camp.id,
            None,
            {"status": "closed"},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(camp)
    return CampaignOut(
        id=camp.id,
        name=camp.name,
        cnpj_id=camp.cnpj_id,
        org_unit_id=camp.org_unit_id,
        questionnaire_version_id=camp.questionnaire_version_id,
        status=camp.status,
    )


# Endpoint de submissão anônima (M2): não exige auth; não armazena PII
@router.post("/{campaign_id}/responses")
def submit_response(
    campaign_id: UUID,
    payload: SurveyResponseSubmit,
    db: Session = Depends(get_db),
):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not camp:
        raise NotFound("Campanha não encontrada")
    if camp.status != "open":
        raise Forbidden("Campanha não está aberta")

    # setor/unidade: se a campanha já estiver setorizada (org_unit_id definido), usamos esse valor.
    # caso contrário, aceitamos o org_unit_id informado no payload (para análise segmentada por setor).
    org_unit_id = camp.org_unit_id or payload.org_unit_id

    if org_unit_id is not None:
        unit = (
            db.query(OrgUnit)
            .filter(
                OrgUnit.id == org_unit_id,
                OrgUnit.tenant_id == camp.tenant_id,
                OrgUnit.cnpj_id == camp.cnpj_id,
            )
            .first()
        )
        if not unit:
            raise BadRequest("org_unit_id inválido para este CNPJ/campanha")

    sr = SurveyResponse(
        tenant_id=camp.tenant_id,
        campaign_id=camp.id,
        questionnaire_version_id=camp.questionnaire_version_id,
        cnpj_id=camp.cnpj_id,
        org_unit_id=org_unit_id,
        answers=payload.answers,
        submitted_at=datetime.utcnow(),
    )
    db.add(sr)
    db.commit()
    return {"status": "ok"}


@router.get("/{campaign_id}/aggregate")
def aggregate_campaign(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    camp = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id).first()
    if not camp:
        raise NotFound("Campanha não encontrada")
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    min_n = settings.min_anon_threshold if settings else 5

    responses = db.query(SurveyResponse).filter(SurveyResponse.campaign_id == camp.id).all()
    if len(responses) < min_n:
        raise Forbidden(f"Agregação bloqueada: mínimo de {min_n} respostas (LGPD)")

    qv = db.query(QuestionnaireVersion).filter(QuestionnaireVersion.id == camp.questionnaire_version_id).first()
    if not qv:
        raise NotFound("Questionário não encontrado")

    dim_scores = compute_dimension_scores(qv.content, [r.answers for r in responses])
    return {"campaign_id": str(camp.id), "responses": len(responses), "dimension_scores": dim_scores}


@router.get("/{campaign_id}/stats")
def campaign_stats(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Estatísticas de campanha (sem PII).

    Ajuda a UX: mostrar progresso de respostas e se a agregação está liberada (LGPD).
    """

    camp = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id).first()
    if not camp:
        raise NotFound("Campanha não encontrada")

    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    min_n = settings.min_anon_threshold if settings else 5

    n = db.query(SurveyResponse).filter(SurveyResponse.campaign_id == camp.id).count()
    return {
        "campaign_id": str(camp.id),
        "responses": n,
        "min_anon_threshold": min_n,
        "aggregation_allowed": n >= min_n,
    }


@router.get("/{campaign_id}/aggregate/by-org-unit")
def aggregate_by_org_unit(
    campaign_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    """Agregação por setor/unidade (org_unit_id) para análises segmentadas.

    LGPD: somente retorna grupos com N >= min_anon_threshold.
    """
    camp = db.query(Campaign).filter(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id).first()
    if not camp:
        raise NotFound("Campanha não encontrada")

    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    min_n = settings.min_anon_threshold if settings else 5

    qv = db.query(QuestionnaireVersion).filter(QuestionnaireVersion.id == camp.questionnaire_version_id).first()
    if not qv:
        raise NotFound("Questionário não encontrado")

    responses = db.query(SurveyResponse).filter(SurveyResponse.campaign_id == camp.id).all()

    # group by org_unit_id
    groups: dict[str, list[dict]] = {}
    for r in responses:
        key = str(r.org_unit_id) if r.org_unit_id else "null"
        groups.setdefault(key, []).append(r.answers)

    results = []
    blocked = []
    for key, answers_list in groups.items():
        if len(answers_list) < min_n:
            blocked.append({"org_unit_id": None if key == "null" else key, "n": len(answers_list)})
            continue
        dim_scores = compute_dimension_scores(qv.content, answers_list)
        results.append({"org_unit_id": None if key == "null" else key, "n": len(answers_list), "dimension_scores": dim_scores})

    return {
        "campaign_id": str(camp.id),
        "min_anon_threshold": min_n,
        "groups": results,
        "blocked_groups": blocked,
    }
