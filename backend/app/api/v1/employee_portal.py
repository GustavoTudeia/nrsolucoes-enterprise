from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from app.core.security import create_access_token

from app.api.deps import (
    get_current_employee,
    tenant_id_from_employee,
    get_request_meta,
    require_active_subscription_employee,
    require_feature_employee,
)
from app.core.audit import make_audit_event
from app.core.errors import Forbidden, NotFound, BadRequest
from app.db.session import get_db
from app.models.employee import Employee
from app.models.lms import (
    ContentAssignment,
    ContentCompletion,
    ContentItem,
    ContentProgress,
)
from app.schemas.lms import ProgressUpdate, ProgressOut
from app.services.storage import create_access_url

router = APIRouter(prefix="/employee")


@router.get("/me")
def employee_me(emp: Employee = Depends(get_current_employee)):
    return {
        "id": str(emp.id),
        "tenant_id": str(emp.tenant_id),
        "identifier": emp.identifier,
        "full_name": emp.full_name,
        "org_unit_id": str(emp.org_unit_id) if emp.org_unit_id else None,
    }


@router.get("/assignments")
def list_assignments(
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription_employee),
    _feat_ok: None = Depends(require_feature_employee("LMS")),
    emp: Employee = Depends(get_current_employee),
    tenant_id: UUID = Depends(tenant_id_from_employee),
):
    q = (
        db.query(ContentAssignment)
        .filter(ContentAssignment.tenant_id == tenant_id)
        .filter(
            or_(
                ContentAssignment.employee_id == emp.id,
                ContentAssignment.org_unit_id == emp.org_unit_id,
            )
        )
        .order_by(ContentAssignment.created_at.desc())
    )
    rows = q.all()

    ids = [r.id for r in rows]
    completion_ids = set()
    progress_map = {}
    if ids:
        comps = (
            db.query(ContentCompletion)
            .filter(
                ContentCompletion.tenant_id == tenant_id,
                ContentCompletion.employee_id == emp.id,
                ContentCompletion.assignment_id.in_(ids),
            )
            .all()
        )
        completion_ids = {str(c.assignment_id) for c in comps}
        prows = (
            db.query(ContentProgress)
            .filter(
                ContentProgress.tenant_id == tenant_id,
                ContentProgress.employee_id == emp.id,
                ContentProgress.assignment_id.in_(ids),
            )
            .all()
        )
        for p in prows:
            progress_map[str(p.assignment_id)] = p

    items = []
    for r in rows:
        status = "completed" if str(r.id) in completion_ids else r.status
        p = progress_map.get(str(r.id))
        items.append(
            {
                "id": str(r.id),
                "content_item_id": (
                    str(r.content_item_id) if r.content_item_id else None
                ),
                "learning_path_id": (
                    str(r.learning_path_id) if r.learning_path_id else None
                ),
                "status": status,
                "due_at": r.due_at.isoformat() if r.due_at else None,
                "progress_seconds": p.position_seconds if p else 0,
                "duration_seconds": p.duration_seconds if p else None,
            }
        )
    return items


def _require_assignment_access(assignment: ContentAssignment, emp: Employee) -> None:
    if assignment.employee_id and assignment.employee_id != emp.id:
        raise Forbidden("Atribuição não pertence ao colaborador")
    if assignment.org_unit_id and emp.org_unit_id != assignment.org_unit_id:
        raise Forbidden("Atribuição não pertence ao setor do colaborador")


@router.get("/contents/{content_id}")
def get_content(
    content_id: UUID,
    assignment_id: Optional[UUID] = Query(
        default=None,
        description="Se informado, valida que o conteúdo está atribuído ao colaborador",
    ),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription_employee),
    _feat_ok: None = Depends(require_feature_employee("LMS")),
    emp: Employee = Depends(get_current_employee),
    tenant_id: UUID = Depends(tenant_id_from_employee),
):
    if assignment_id:
        assignment = (
            db.query(ContentAssignment)
            .filter(
                ContentAssignment.id == assignment_id,
                ContentAssignment.tenant_id == tenant_id,
            )
            .first()
        )
        if not assignment:
            raise NotFound("Atribuição não encontrada")
        _require_assignment_access(assignment, emp)
        if assignment.content_item_id and assignment.content_item_id != content_id:
            raise Forbidden("Conteúdo não corresponde à atribuição")

    c = (
        db.query(ContentItem)
        .filter(ContentItem.id == content_id, ContentItem.is_active == True)
        .filter((ContentItem.tenant_id == None) | (ContentItem.tenant_id == tenant_id))
        .first()
    )
    if not c:
        raise NotFound("Conteúdo não encontrado")

    access_url = c.url
    if c.storage_key:
        pres = create_access_url(c.storage_key)
        access_url = pres.url

    if not access_url:
        raise BadRequest("Conteúdo sem URL (upload incompleto)")

    return {
        "id": str(c.id),
        "title": c.title,
        "description": c.description,
        "url": access_url,
        "content_type": c.content_type,
        "duration_minutes": c.duration_minutes,
    }


@router.post("/completions")
def complete_assignment(
    assignment_id: UUID = Query(...),
    completion_method: str = Query(default="manual"),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription_employee),
    _feat_ok: None = Depends(require_feature_employee("LMS")),
    emp: Employee = Depends(get_current_employee),
    tenant_id: UUID = Depends(tenant_id_from_employee),
    meta: dict = Depends(get_request_meta),
):
    assignment = (
        db.query(ContentAssignment)
        .filter(
            ContentAssignment.id == assignment_id,
            ContentAssignment.tenant_id == tenant_id,
        )
        .first()
    )
    if not assignment:
        raise NotFound("Atribuição não encontrada")
    _require_assignment_access(assignment, emp)

    existing = (
        db.query(ContentCompletion)
        .filter(
            ContentCompletion.tenant_id == tenant_id,
            ContentCompletion.assignment_id == assignment.id,
            ContentCompletion.employee_id == emp.id,
        )
        .first()
    )
    if existing:
        return {"id": str(existing.id)}

    comp = ContentCompletion(
        tenant_id=tenant_id,
        assignment_id=assignment.id,
        employee_id=emp.id,
        completed_at=datetime.utcnow(),
        completion_method=completion_method,
    )
    db.add(comp)
    assignment.status = "completed"
    db.add(assignment)

    db.add(
        make_audit_event(
            tenant_id,
            actor_user_id=None,
            action="CREATE",
            entity_type="CONTENT_COMPLETION",
            entity_id=comp.id,
            before=None,
            after={
                "assignment_id": str(assignment.id),
                "employee_id": str(emp.id),
                "method": completion_method,
            },
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    return {"id": str(comp.id)}


@router.post("/progress", response_model=ProgressOut)
def upsert_progress(
    payload: ProgressUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription_employee),
    _feat_ok: None = Depends(require_feature_employee("LMS")),
    emp: Employee = Depends(get_current_employee),
    tenant_id: UUID = Depends(tenant_id_from_employee),
    meta: dict = Depends(get_request_meta),
):
    assignment = (
        db.query(ContentAssignment)
        .filter(
            ContentAssignment.id == payload.assignment_id,
            ContentAssignment.tenant_id == tenant_id,
        )
        .first()
    )
    if not assignment:
        raise NotFound("Atribuição não encontrada")
    _require_assignment_access(assignment, emp)

    row = (
        db.query(ContentProgress)
        .filter(
            ContentProgress.tenant_id == tenant_id,
            ContentProgress.assignment_id == assignment.id,
            ContentProgress.employee_id == emp.id,
        )
        .first()
    )
    if not row:
        row = ContentProgress(
            tenant_id=tenant_id,
            assignment_id=assignment.id,
            employee_id=emp.id,
            position_seconds=payload.position_seconds,
            duration_seconds=payload.duration_seconds,
            last_event_at=datetime.utcnow(),
        )
        db.add(row)
    else:
        row.position_seconds = payload.position_seconds
        if payload.duration_seconds is not None:
            row.duration_seconds = payload.duration_seconds
        row.last_event_at = datetime.utcnow()
        db.add(row)

    if row.duration_seconds and row.duration_seconds > 0:
        if row.position_seconds >= int(row.duration_seconds * 0.9):
            existing = (
                db.query(ContentCompletion)
                .filter(
                    ContentCompletion.tenant_id == tenant_id,
                    ContentCompletion.assignment_id == assignment.id,
                    ContentCompletion.employee_id == emp.id,
                )
                .first()
            )
            if not existing:
                comp = ContentCompletion(
                    tenant_id=tenant_id,
                    assignment_id=assignment.id,
                    employee_id=emp.id,
                    completed_at=datetime.utcnow(),
                    completion_method="watch_threshold",
                )
                db.add(comp)
                assignment.status = "completed"
                db.add(assignment)

    db.add(
        make_audit_event(
            tenant_id,
            actor_user_id=None,
            action="UPDATE",
            entity_type="CONTENT_PROGRESS",
            entity_id=row.id,
            before=None,
            after={
                "assignment_id": str(assignment.id),
                "employee_id": str(emp.id),
                "pos": row.position_seconds,
            },
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(row)
    return ProgressOut(
        assignment_id=row.assignment_id,
        employee_id=row.employee_id,
        position_seconds=row.position_seconds,
        duration_seconds=row.duration_seconds,
        last_event_at=row.last_event_at,
    )


@router.post("/auth/login")
def employee_login(
    identifier: str = Query(..., description="Email, CPF ou ID do colaborador"),
    tenant_id: UUID = Query(..., description="ID do tenant"),
    db: Session = Depends(get_db),
):
    """Login simplificado para colaborador (ambiente de desenvolvimento)."""
    employee = (
        db.query(Employee)
        .filter(
            Employee.tenant_id == tenant_id,
            Employee.identifier == identifier,
            Employee.is_active == True,
        )
        .first()
    )

    if not employee:
        raise NotFound("Colaborador não encontrado")

    # Gerar token JWT
    token_data = {
        "sub": str(employee.id),
        "tid": str(employee.tenant_id),
        "type": "employee",
    }
    access_token = create_access_token(token_data)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "employee": {
            "id": str(employee.id),
            "identifier": employee.identifier,
            "full_name": employee.full_name,
        },
    }
