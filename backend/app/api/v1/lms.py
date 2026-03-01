from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_user,
    require_any_role,
    tenant_id_from_user,
    get_request_meta,
    require_feature,
    require_active_subscription,
)
from app.core.audit import make_audit_event
from app.core.errors import Forbidden, NotFound, BadRequest
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER
from app.db.session import get_db
from app.models.lms import ContentItem, ContentAssignment, ContentCompletion, ContentProgress
from app.schemas.common import Page
from app.schemas.lms import (
    ContentCreate,
    ContentOut,
    ContentUploadCreate,
    ContentUploadOut,
    ContentAccessOut,
    AssignmentCreate,
    AssignmentOut,
    CompletionCreate,
)
from app.services.storage import create_upload_url, create_access_url

router = APIRouter(prefix="/lms")


def _require_lms_manager(user) -> UUID | None:
    if user.is_platform_admin:
        return None
    if not user.tenant_id:
        raise Forbidden("Usuário sem tenant")
    keys = [urs.role.key for urs in user.roles]
    if not any(k in keys for k in [ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]):
        raise Forbidden("Permissão insuficiente para gerenciar conteúdos")
    return user.tenant_id


@router.post("/contents", response_model=ContentOut)
def create_content(
    payload: ContentCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    if payload.content_type == "link" and not payload.url:
        raise BadRequest("url é obrigatório para content_type=link")

    tenant_id = None
    if payload.is_platform_managed:
        if not user.is_platform_admin:
            raise Forbidden("Somente admin da plataforma cria conteúdo oficial")
        tenant_id = None
    else:
        tenant_id = _require_lms_manager(user)

    c = ContentItem(
        tenant_id=tenant_id,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        content_type=payload.content_type,
        url=payload.url,
        storage_key=None,
        duration_minutes=payload.duration_minutes,
        is_platform_managed=payload.is_platform_managed,
        is_active=True,
    )
    db.add(c)
    db.flush()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "CONTENT_ITEM",
            c.id,
            None,
            {"title": c.title, "content_type": c.content_type},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(c)
    return ContentOut(
        id=c.id,
        title=c.title,
        description=c.description,
        content_type=c.content_type,
        url=c.url,
        storage_key=c.storage_key,
        duration_minutes=c.duration_minutes,
        is_platform_managed=c.is_platform_managed,
        is_active=c.is_active,
    )


@router.post("/contents/upload", response_model=ContentUploadOut)
def create_content_upload(
    payload: ContentUploadCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    if payload.is_platform_managed and not user.is_platform_admin:
        raise Forbidden("Somente admin da plataforma cria conteúdo oficial")

    tenant_id = None if payload.is_platform_managed else _require_lms_manager(user)
    safe_name = payload.filename.replace("/", "_").replace("\\", "_").strip()

    c = ContentItem(
        tenant_id=tenant_id,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        content_type="video",
        url=None,
        storage_key=None,
        duration_minutes=(int(payload.duration_seconds / 60) if payload.duration_seconds else None),
        is_platform_managed=bool(payload.is_platform_managed),
        is_active=True,
    )
    db.add(c)
    db.flush()

    key_prefix = "platform" if tenant_id is None else f"tenants/{tenant_id}"
    key = f"{key_prefix}/content/{c.id}/{safe_name}"
    c.storage_key = key
    db.add(c)
    db.flush()

    pres = create_upload_url(key, payload.mime_type)

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "CONTENT_UPLOAD",
            c.id,
            None,
            {"title": c.title, "storage_key": key},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return ContentUploadOut(content_id=c.id, upload_url=pres.url, expires_in_seconds=pres.expires_in)


@router.get("/contents/{content_id}/access", response_model=ContentAccessOut)
def get_content_access(
    content_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(get_current_user),
):
    q = db.query(ContentItem).filter(ContentItem.id == content_id, ContentItem.is_active == True)
    if user.is_platform_admin:
        r = q.first()
    else:
        if not user.tenant_id:
            raise Forbidden("Usuário sem tenant")
        r = q.filter((ContentItem.tenant_id == None) | (ContentItem.tenant_id == user.tenant_id)).first()
    if not r:
        raise NotFound("Conteúdo não encontrado")

    if r.storage_key:
        pres = create_access_url(r.storage_key)
        return ContentAccessOut(content_id=r.id, access_url=pres.url, expires_in_seconds=pres.expires_in)
    if r.url:
        return ContentAccessOut(content_id=r.id, access_url=r.url, expires_in_seconds=0)
    raise BadRequest("Conteúdo sem URL (upload incompleto)")


@router.get("/contents", response_model=list[ContentOut])
def list_contents(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if user.is_platform_admin:
        rows = db.query(ContentItem).filter(ContentItem.is_active == True).order_by(ContentItem.created_at.desc()).all()
    else:
        if not user.tenant_id:
            raise Forbidden("Usuário sem tenant")
        rows = (
            db.query(ContentItem)
            .filter(ContentItem.is_active == True)
            .filter((ContentItem.tenant_id == None) | (ContentItem.tenant_id == user.tenant_id))
            .order_by(ContentItem.created_at.desc())
            .all()
        )
    return [
        ContentOut(
            id=r.id,
            title=r.title,
            description=r.description,
            content_type=r.content_type,
            url=r.url,
            storage_key=r.storage_key,
            duration_minutes=r.duration_minutes,
            is_platform_managed=r.is_platform_managed,
            is_active=r.is_active,
        )
        for r in rows
    ]


@router.get("/assignments", response_model=Page[AssignmentOut])
def list_assignments(
    employee_id: Optional[UUID] = Query(default=None),
    org_unit_id: Optional[UUID] = Query(default=None),
    content_item_id: Optional[UUID] = Query(default=None),
    status: Optional[str] = Query(default=None, description="assigned|in_progress|completed"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    base = db.query(ContentAssignment).filter(ContentAssignment.tenant_id == tenant_id)
    if employee_id:
        base = base.filter(ContentAssignment.employee_id == employee_id)
    if org_unit_id:
        base = base.filter(ContentAssignment.org_unit_id == org_unit_id)
    if content_item_id:
        base = base.filter(ContentAssignment.content_item_id == content_item_id)
    if status:
        base = base.filter(ContentAssignment.status == status)

    total = base.count()
    rows = base.order_by(ContentAssignment.created_at.desc()).offset(offset).limit(limit).all()

    assignment_ids = [r.id for r in rows]
    progress_map = {}
    completion_map = {}
    if assignment_ids:
        prows = (
            db.query(ContentProgress)
            .filter(ContentProgress.tenant_id == tenant_id, ContentProgress.assignment_id.in_(assignment_ids))
            .all()
        )
        for p in prows:
            progress_map[str(p.assignment_id)] = p
        crows = (
            db.query(ContentCompletion)
            .filter(ContentCompletion.tenant_id == tenant_id, ContentCompletion.assignment_id.in_(assignment_ids))
            .all()
        )
        for c in crows:
            completion_map[str(c.assignment_id)] = c

    items = []
    for r in rows:
        p = progress_map.get(str(r.id))
        c = completion_map.get(str(r.id))
        items.append(
            AssignmentOut(
                id=r.id,
                content_item_id=r.content_item_id,
                learning_path_id=r.learning_path_id,
                employee_id=r.employee_id,
                org_unit_id=r.org_unit_id,
                due_at=r.due_at,
                status=r.status,
                created_at=r.created_at,
                progress_seconds=p.position_seconds if p else None,
                duration_seconds=p.duration_seconds if p else None,
                completed_at=c.completed_at if c else None,
            )
        )
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/assignments/{assignment_id}", response_model=AssignmentOut)
def get_assignment(
    assignment_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    r = db.query(ContentAssignment).filter(ContentAssignment.id == assignment_id, ContentAssignment.tenant_id == tenant_id).first()
    if not r:
        raise NotFound("Atribuição não encontrada")
    return AssignmentOut(
        id=r.id,
        content_item_id=r.content_item_id,
        learning_path_id=r.learning_path_id,
        employee_id=r.employee_id,
        org_unit_id=r.org_unit_id,
        due_at=r.due_at,
        status=r.status,
        created_at=r.created_at,
    )


@router.post("/assignments", response_model=dict)
def create_assignment(
    payload: AssignmentCreate,
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    db: Session = Depends(get_db),
    user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER])),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    if not payload.content_item_id and not payload.learning_path_id:
        raise BadRequest("Informe content_item_id ou learning_path_id")
    if payload.employee_id is None and payload.org_unit_id is None:
        raise BadRequest("Informe employee_id ou org_unit_id (alvo)")

    a = ContentAssignment(
        tenant_id=tenant_id,
        content_item_id=payload.content_item_id,
        learning_path_id=payload.learning_path_id,
        employee_id=payload.employee_id,
        org_unit_id=payload.org_unit_id,
        due_at=None,
        status="assigned",
    )
    db.add(a)
    db.flush()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "CONTENT_ASSIGNMENT",
            a.id,
            None,
            {"target_employee": str(a.employee_id) if a.employee_id else None, "org_unit_id": str(a.org_unit_id) if a.org_unit_id else None},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"id": str(a.id)}


@router.post("/completions", response_model=dict)
def create_completion(
    payload: CompletionCreate,
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    assignment = db.query(ContentAssignment).filter(ContentAssignment.id == payload.assignment_id, ContentAssignment.tenant_id == tenant_id).first()
    if not assignment:
        raise NotFound("Atribuição não encontrada")
    if not assignment.employee_id:
        raise BadRequest("Atribuição não é individual; use portal do colaborador para registrar por pessoa")

    existing = db.query(ContentCompletion).filter(ContentCompletion.tenant_id == tenant_id, ContentCompletion.assignment_id == assignment.id, ContentCompletion.employee_id == assignment.employee_id).first()
    if existing:
        return {"id": str(existing.id)}

    c = ContentCompletion(
        tenant_id=tenant_id,
        assignment_id=assignment.id,
        employee_id=assignment.employee_id,
        completed_at=datetime.utcnow(),
        completion_method=payload.completion_method,
    )
    db.add(c)
    assignment.status = "completed"
    db.add(assignment)

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "CONTENT_COMPLETION",
            c.id,
            None,
            {"assignment_id": str(assignment.id), "method": payload.completion_method},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"id": str(c.id)}
