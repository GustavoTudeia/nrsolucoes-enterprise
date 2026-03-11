from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import (
    require_platform_admin,
    require_any_role,
    tenant_id_from_user,
    get_request_meta,
    require_active_subscription,
)
from app.core.audit import make_audit_event
from app.core.errors import Forbidden, NotFound, BadRequest
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.db.session import get_db
from app.models.campaign import Campaign, SurveyResponse
from app.models.org import OrgUnit
from app.models.questionnaire import QuestionnaireVersion
from app.models.risk import RiskCriterionVersion, RiskAssessment
from app.models.tenant import TenantSettings
from app.schemas.common import Page
from app.schemas.risk import CriterionCreate, CriterionOut, RiskAssessmentOut
from app.services.risk_engine import compute_dimension_scores, apply_criterion

router = APIRouter(prefix="/risks")


def _build_assessment_out(r: RiskAssessment, db: Session) -> RiskAssessmentOut:
    """Helper para construir RiskAssessmentOut com nomes relacionados."""
    # Buscar nome da campanha
    campaign_name = None
    campaign = db.query(Campaign).filter(Campaign.id == r.campaign_id).first()
    if campaign:
        campaign_name = campaign.name

    # Buscar nome da unidade/setor
    org_unit_name = None
    if r.org_unit_id:
        org_unit = db.query(OrgUnit).filter(OrgUnit.id == r.org_unit_id).first()
        if org_unit:
            org_unit_name = org_unit.name

    # Buscar nome do critério
    criterion_name = None
    criterion = (
        db.query(RiskCriterionVersion)
        .filter(RiskCriterionVersion.id == r.criterion_version_id)
        .first()
    )
    if criterion:
        criterion_name = criterion.name

    return RiskAssessmentOut(
        id=r.id,
        campaign_id=r.campaign_id,
        campaign_name=campaign_name,
        cnpj_id=r.cnpj_id,
        org_unit_id=r.org_unit_id,
        org_unit_name=org_unit_name,
        criterion_version_id=r.criterion_version_id,
        criterion_name=criterion_name,
        score=r.score,
        level=r.level,
        dimension_scores=r.dimension_scores,
        assessed_at=r.assessed_at,
        created_at=r.created_at,
    )


@router.post("/criteria", response_model=dict)
def create_criterion(
    payload: CriterionCreate,
    db: Session = Depends(get_db),
    user=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    cv = RiskCriterionVersion(
        tenant_id=None,
        name=payload.name,
        status="published",
        content=payload.content,
        version=1,
        published_at=datetime.utcnow(),
    )
    db.add(cv)
    db.flush()
    db.add(
        make_audit_event(
            None,
            user.id,
            "CREATE",
            "RISK_CRITERION",
            cv.id,
            None,
            {"name": cv.name},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"id": str(cv.id), "name": cv.name}


@router.get("/criteria", response_model=Page[CriterionOut])
def list_criteria(
    status: Optional[str] = Query(default="published"),
    q: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    # criteria é global (plataforma) por padrão; ainda assim restringimos a usuários autenticados do tenant
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    base = db.query(RiskCriterionVersion).filter(RiskCriterionVersion.tenant_id == None)
    if status:
        base = base.filter(RiskCriterionVersion.status == status)
    if q:
        like = f"%{q.strip()}%"
        base = base.filter(RiskCriterionVersion.name.ilike(like))
    total = base.count()
    rows = (
        base.order_by(RiskCriterionVersion.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    items = [
        CriterionOut(
            id=r.id,
            tenant_id=r.tenant_id,
            name=r.name,
            status=r.status,
            version=r.version,
            content=r.content,
            published_at=r.published_at,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/criteria/{criterion_id}", response_model=CriterionOut)
def get_criterion(
    criterion_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    r = (
        db.query(RiskCriterionVersion)
        .filter(
            RiskCriterionVersion.id == criterion_id,
            RiskCriterionVersion.tenant_id == None,
        )
        .first()
    )
    if not r:
        raise NotFound("Critério não encontrado")
    return CriterionOut(
        id=r.id,
        tenant_id=r.tenant_id,
        name=r.name,
        status=r.status,
        version=r.version,
        content=r.content,
        published_at=r.published_at,
        created_at=r.created_at,
    )


@router.post("/assess/{campaign_id}", response_model=RiskAssessmentOut)
def assess_campaign(
    campaign_id: UUID,
    criterion_version_id: UUID,
    org_unit_id: UUID | None = None,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    camp = (
        db.query(Campaign)
        .filter(Campaign.id == campaign_id, Campaign.tenant_id == tenant_id)
        .first()
    )
    if not camp:
        raise NotFound("Campanha não encontrada")

    settings = (
        db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    )
    min_n = settings.min_anon_threshold if settings else 5
    target_org_unit_id = camp.org_unit_id or org_unit_id

    if target_org_unit_id is not None and camp.org_unit_id is None:
        unit = (
            db.query(OrgUnit)
            .filter(
                OrgUnit.id == target_org_unit_id,
                OrgUnit.tenant_id == tenant_id,
                OrgUnit.cnpj_id == camp.cnpj_id,
            )
            .first()
        )
        if not unit:
            raise BadRequest("org_unit_id inválido para este CNPJ/campanha")

    q = db.query(SurveyResponse).filter(SurveyResponse.campaign_id == camp.id)
    if target_org_unit_id is not None:
        q = q.filter(SurveyResponse.org_unit_id == target_org_unit_id)
    responses = q.all()
    if len(responses) < min_n:
        raise Forbidden(f"Classificação bloqueada: mínimo de {min_n} respostas (LGPD)")

    qv = (
        db.query(QuestionnaireVersion)
        .filter(QuestionnaireVersion.id == camp.questionnaire_version_id)
        .first()
    )
    if not qv:
        raise NotFound("Questionário não encontrado")

    crit = (
        db.query(RiskCriterionVersion)
        .filter(RiskCriterionVersion.id == criterion_version_id)
        .first()
    )
    if not crit or crit.status != "published":
        raise BadRequest("Critério inválido")

    dim_scores = compute_dimension_scores(qv.content, [r.answers for r in responses])
    score, level = apply_criterion(crit.content, dim_scores)

    ra = RiskAssessment(
        tenant_id=tenant_id,
        campaign_id=camp.id,
        cnpj_id=camp.cnpj_id,
        org_unit_id=target_org_unit_id,
        criterion_version_id=crit.id,
        score=score,
        level=level,
        dimension_scores=dim_scores,
        assessed_at=datetime.utcnow(),
    )
    db.add(ra)
    db.flush()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "RISK_ASSESSMENT",
            ra.id,
            None,
            {
                "level": level,
                "score": score,
                "campaign_id": str(camp.id),
                "org_unit_id": str(target_org_unit_id) if target_org_unit_id else None,
            },
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(ra)

    return _build_assessment_out(ra, db)


@router.get("/assessments", response_model=Page[RiskAssessmentOut])
def list_assessments(
    campaign_id: Optional[UUID] = Query(default=None),
    cnpj_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    level: Optional[str] = Query(default=None, description="low|medium|high"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    base = db.query(RiskAssessment).filter(RiskAssessment.tenant_id == tenant_id)
    if campaign_id:
        base = base.filter(RiskAssessment.campaign_id == campaign_id)
    if cnpj_id:
        base = base.filter(RiskAssessment.cnpj_id == cnpj_id)
    if org_unit_id:
        base = base.filter(RiskAssessment.org_unit_id == org_unit_id)
    if level:
        base = base.filter(RiskAssessment.level == level)

    total = base.count()
    rows = (
        base.order_by(RiskAssessment.assessed_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = [_build_assessment_out(r, db) for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/assessments/{assessment_id}", response_model=RiskAssessmentOut)
def get_assessment(
    assessment_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    user=Depends(
        require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])
    ),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    r = (
        db.query(RiskAssessment)
        .filter(
            RiskAssessment.id == assessment_id, RiskAssessment.tenant_id == tenant_id
        )
        .first()
    )
    if not r:
        raise NotFound("Avaliação não encontrada")

    return _build_assessment_out(r, db)
