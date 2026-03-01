from __future__ import annotations

from datetime import datetime
from uuid import UUID
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from app.api.deps import (
    get_current_user,
    tenant_id_from_user,
    require_any_role,
    get_request_meta,
    require_feature,
    require_active_subscription,
)
from app.core.audit import make_audit_event
from app.core.errors import BadRequest, Forbidden, NotFound
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.db.session import get_db
from app.models.esocial import ESocialS2240Profile, ESocialS2210Accident, ESocialS2220Exam
from app.models.user import User
from app.schemas.common import Page
from app.schemas.esocial import (
    S2240ProfileCreate,
    S2240ProfileOut,
    S2210AccidentCreate,
    S2210AccidentOut,
    S2220ExamCreate,
    S2220ExamOut,
    ESocialExportOut,
)

router = APIRouter(prefix="/esocial")


def _tenant_ctx(user: User, tenant_id: Optional[UUID]) -> UUID:
    # Console padrão (tenant user)
    if not user.is_platform_admin:
        if not user.tenant_id:
            raise Forbidden("Usuário sem tenant associado")
        return user.tenant_id

    # Platform admin pode operar em um tenant de contexto (user.tenant_id) ou via query param
    if tenant_id:
        return tenant_id
    if user.tenant_id:
        return user.tenant_id
    raise BadRequest("Informe tenant_id (admin da plataforma sem tenant de contexto)")


# ============================================================
# S-2240 (assistido): Perfis de exposição / condições de trabalho
# ============================================================
@router.get(
    "/s2240/profiles",
    response_model=Page[S2240ProfileOut],
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def list_s2240_profiles(
    tenant_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
):
    tid = _tenant_ctx(user, tenant_id)
    q = db.query(ESocialS2240Profile).filter(ESocialS2240Profile.tenant_id == tid).order_by(desc(ESocialS2240Profile.created_at))
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    return Page(
        items=[
            S2240ProfileOut(
                id=r.id,
                tenant_id=r.tenant_id,
                cnpj_id=r.cnpj_id,
                org_unit_id=r.org_unit_id,
                role_name=r.role_name,
                environment_code=r.environment_code,
                activity_description=r.activity_description,
                factors=r.factors or [],
                controls=r.controls or {},
                valid_from=r.valid_from,
                valid_to=r.valid_to,
                is_active=r.is_active,
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/s2240/profiles",
    response_model=S2240ProfileOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def create_s2240_profile(
    payload: S2240ProfileCreate,
    tenant_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    meta: dict = Depends(get_request_meta),
):
    tid = _tenant_ctx(user, tenant_id)
    r = ESocialS2240Profile(
        tenant_id=tid,
        cnpj_id=payload.cnpj_id,
        org_unit_id=payload.org_unit_id,
        role_name=payload.role_name,
        environment_code=payload.environment_code,
        activity_description=payload.activity_description,
        factors=[f.model_dump() for f in (payload.factors or [])],
        controls=payload.controls or {},
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
        is_active=payload.is_active,
    )
    db.add(r)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id=tid,
            actor_user_id=user.id,
            action="CREATE",
            entity_type="ESOCIAL_S2240_PROFILE",
            entity_id=r.id,
            before=None,
            after={"role_name": r.role_name, "cnpj_id": str(r.cnpj_id)},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(r)
    return S2240ProfileOut(
        id=r.id,
        tenant_id=r.tenant_id,
        cnpj_id=r.cnpj_id,
        org_unit_id=r.org_unit_id,
        role_name=r.role_name,
        environment_code=r.environment_code,
        activity_description=r.activity_description,
        factors=r.factors or [],
        controls=r.controls or {},
        valid_from=r.valid_from,
        valid_to=r.valid_to,
        is_active=r.is_active,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.get(
    "/s2240/profiles/{profile_id}/export",
    response_model=ESocialExportOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def export_s2240_profile(
    profile_id: UUID,
    tenant_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
):
    tid = _tenant_ctx(user, tenant_id)
    r = db.query(ESocialS2240Profile).filter(ESocialS2240Profile.id == profile_id, ESocialS2240Profile.tenant_id == tid).first()
    if not r:
        raise NotFound("Perfil não encontrado")

    # Export assistido (JSON) para integração com software de envio (contabilidade/SESMT)
    data = {
        "tenant_id": str(tid),
        "cnpj_id": str(r.cnpj_id),
        "org_unit_id": str(r.org_unit_id) if r.org_unit_id else None,
        "role_name": r.role_name,
        "environment_code": r.environment_code,
        "activity_description": r.activity_description,
        "valid_from": r.valid_from.isoformat() if r.valid_from else None,
        "valid_to": r.valid_to.isoformat() if r.valid_to else None,
        "factors": r.factors or [],
        "controls": r.controls or {},
        "note": "Export assistido (base). O layout oficial do eSocial pode exigir campos adicionais. Use este JSON como fonte consistente e auditável.",
    }
    return ESocialExportOut(event="S-2240", generated_at=datetime.utcnow(), data=data)


# ============================================================
# S-2210 (assistido): registro interno para suporte à CAT/evento
# ============================================================
@router.get(
    "/s2210/accidents",
    response_model=Page[S2210AccidentOut],
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def list_s2210_accidents(
    tenant_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
):
    tid = _tenant_ctx(user, tenant_id)
    q = db.query(ESocialS2210Accident).filter(ESocialS2210Accident.tenant_id == tid).order_by(desc(ESocialS2210Accident.occurred_at))
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    return Page(
        items=[
            S2210AccidentOut(
                id=r.id,
                tenant_id=r.tenant_id,
                employee_id=r.employee_id,
                occurred_at=r.occurred_at,
                accident_type=r.accident_type,
                description=r.description,
                location=r.location,
                cat_number=r.cat_number,
                payload=r.payload or {},
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/s2210/accidents",
    response_model=S2210AccidentOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def create_s2210_accident(
    payload: S2210AccidentCreate,
    tenant_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    meta: dict = Depends(get_request_meta),
):
    tid = _tenant_ctx(user, tenant_id)
    r = ESocialS2210Accident(
        tenant_id=tid,
        employee_id=payload.employee_id,
        occurred_at=payload.occurred_at or datetime.utcnow(),
        accident_type=payload.accident_type,
        description=payload.description,
        location=payload.location,
        cat_number=payload.cat_number,
        payload=payload.payload or {},
    )
    db.add(r)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id=tid,
            actor_user_id=user.id,
            action="CREATE",
            entity_type="ESOCIAL_S2210_ACCIDENT",
            entity_id=r.id,
            before=None,
            after={"employee_id": str(r.employee_id), "occurred_at": r.occurred_at.isoformat()},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(r)
    return S2210AccidentOut(
        id=r.id,
        tenant_id=r.tenant_id,
        employee_id=r.employee_id,
        occurred_at=r.occurred_at,
        accident_type=r.accident_type,
        description=r.description,
        location=r.location,
        cat_number=r.cat_number,
        payload=r.payload or {},
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.get(
    "/s2210/accidents/{accident_id}/export",
    response_model=ESocialExportOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def export_s2210_accident(
    accident_id: UUID,
    tenant_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
):
    tid = _tenant_ctx(user, tenant_id)
    r = db.query(ESocialS2210Accident).filter(ESocialS2210Accident.id == accident_id, ESocialS2210Accident.tenant_id == tid).first()
    if not r:
        raise NotFound("Registro não encontrado")

    data = {
        "tenant_id": str(tid),
        "employee_id": str(r.employee_id),
        "occurred_at": r.occurred_at.isoformat(),
        "accident_type": r.accident_type,
        "description": r.description,
        "location": r.location,
        "cat_number": r.cat_number,
        "payload": r.payload or {},
        "note": "Export assistido (base) para apoiar o preenchimento do S-2210/CAT em integrador.",
    }
    return ESocialExportOut(event="S-2210", generated_at=datetime.utcnow(), data=data)


# ============================================================
# S-2220 (assistido): monitoramento da saúde (registro mínimo)
# ============================================================
@router.get(
    "/s2220/exams",
    response_model=Page[S2220ExamOut],
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def list_s2220_exams(
    tenant_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
):
    tid = _tenant_ctx(user, tenant_id)
    q = db.query(ESocialS2220Exam).filter(ESocialS2220Exam.tenant_id == tid).order_by(desc(ESocialS2220Exam.exam_date))
    total = q.count()
    rows = q.offset(offset).limit(limit).all()
    return Page(
        items=[
            S2220ExamOut(
                id=r.id,
                tenant_id=r.tenant_id,
                employee_id=r.employee_id,
                exam_date=r.exam_date,
                exam_type=r.exam_type,
                result=r.result,
                payload=r.payload or {},
                created_at=r.created_at,
                updated_at=r.updated_at,
            )
            for r in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/s2220/exams",
    response_model=S2220ExamOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def create_s2220_exam(
    payload: S2220ExamCreate,
    tenant_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    meta: dict = Depends(get_request_meta),
):
    tid = _tenant_ctx(user, tenant_id)
    r = ESocialS2220Exam(
        tenant_id=tid,
        employee_id=payload.employee_id,
        exam_date=payload.exam_date or datetime.utcnow(),
        exam_type=payload.exam_type,
        result=payload.result,
        payload=payload.payload or {},
    )
    db.add(r)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id=tid,
            actor_user_id=user.id,
            action="CREATE",
            entity_type="ESOCIAL_S2220_EXAM",
            entity_id=r.id,
            before=None,
            after={"employee_id": str(r.employee_id), "exam_date": r.exam_date.isoformat()},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(r)
    return S2220ExamOut(
        id=r.id,
        tenant_id=r.tenant_id,
        employee_id=r.employee_id,
        exam_date=r.exam_date,
        exam_type=r.exam_type,
        result=r.result,
        payload=r.payload or {},
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


@router.get(
    "/s2220/exams/{exam_id}/export",
    response_model=ESocialExportOut,
    dependencies=[Depends(require_active_subscription), Depends(require_feature("ESOCIAL_EXPORT"))],
)
def export_s2220_exam(
    exam_id: UUID,
    tenant_id: Optional[UUID] = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
):
    tid = _tenant_ctx(user, tenant_id)
    r = db.query(ESocialS2220Exam).filter(ESocialS2220Exam.id == exam_id, ESocialS2220Exam.tenant_id == tid).first()
    if not r:
        raise NotFound("Registro não encontrado")

    data = {
        "tenant_id": str(tid),
        "employee_id": str(r.employee_id),
        "exam_date": r.exam_date.isoformat(),
        "exam_type": r.exam_type,
        "result": r.result,
        "payload": r.payload or {},
        "note": "Export assistido (base). O S-2220 possui layout detalhado e normalmente é gerido por medicina/ocupacional.",
    }
    return ESocialExportOut(event="S-2220", generated_at=datetime.utcnow(), data=data)
