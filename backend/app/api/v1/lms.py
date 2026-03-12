from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
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
from app.models.lms import (
    ContentItem,
    ContentAssignment,
    ContentCompletion,
    ContentProgress,
    LearningPath,
    LearningPathItem,
)
from app.schemas.common import Page
from app.schemas.lms import (
    ContentCreate,
    ContentUpdate,
    ContentOut,
    ContentUploadCreate,
    ContentUploadOut,
    ContentAccessOut,
    AssignmentCreate,
    AssignmentUpdate,
    AssignmentOut,
    BulkAssignmentCreate,
    CompletionCreate,
    LearningPathCreate,
    LearningPathUpdate,
    LearningPathOut,
    LearningPathItemOut,
    LMSStatsOut,
)
from app.services.storage import create_upload_url, create_access_url

router = APIRouter(prefix="/lms")

_MANAGER_ROLES = [ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]


def _require_lms_manager(user) -> UUID | None:
    if user.is_platform_admin:
        return None
    if not user.tenant_id:
        raise Forbidden("Usuário sem tenant")
    keys = [urs.role.key for urs in user.roles]
    if not any(k in keys for k in [ROLE_TENANT_ADMIN, ROLE_CNPJ_MANAGER, ROLE_UNIT_MANAGER]):
        raise Forbidden("Permissão insuficiente para gerenciar conteúdos")
    return user.tenant_id


# ---------------------------------------------------------------------------
# Contents
# ---------------------------------------------------------------------------


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


@router.patch("/contents/{content_id}", response_model=ContentOut)
def update_content(
    content_id: UUID,
    payload: ContentUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    tenant_id = _require_lms_manager(user)

    q = db.query(ContentItem).filter(ContentItem.id == content_id)
    if tenant_id is not None:
        q = q.filter((ContentItem.tenant_id == tenant_id) | (ContentItem.is_platform_managed == True))
    item = q.first()
    if not item:
        raise NotFound("Conteúdo não encontrado")

    # Only platform admin can edit platform-managed content
    if item.is_platform_managed and not user.is_platform_admin:
        raise Forbidden("Somente admin da plataforma edita conteúdo oficial")

    changes: dict = {}
    if payload.title is not None:
        item.title = payload.title.strip()
        changes["title"] = item.title
    if payload.description is not None:
        item.description = payload.description.strip()
        changes["description"] = item.description
    if payload.url is not None:
        item.url = payload.url
        changes["url"] = item.url
    if payload.duration_minutes is not None:
        item.duration_minutes = payload.duration_minutes
        changes["duration_minutes"] = item.duration_minutes
    if payload.is_active is not None:
        item.is_active = payload.is_active
        changes["is_active"] = item.is_active

    if changes:
        db.add(item)
        db.flush()
        db.add(
            make_audit_event(
                item.tenant_id,
                user.id,
                "UPDATE",
                "CONTENT_ITEM",
                item.id,
                None,
                changes,
                meta.get("ip"),
                meta.get("user_agent"),
                meta.get("request_id"),
            )
        )
        db.commit()
        db.refresh(item)

    return ContentOut(
        id=item.id,
        title=item.title,
        description=item.description,
        content_type=item.content_type,
        url=item.url,
        storage_key=item.storage_key,
        duration_minutes=item.duration_minutes,
        is_platform_managed=item.is_platform_managed,
        is_active=item.is_active,
    )


@router.delete("/contents/{content_id}", response_model=dict)
def delete_content(
    content_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    tenant_id = _require_lms_manager(user)

    q = db.query(ContentItem).filter(ContentItem.id == content_id)
    if tenant_id is not None:
        q = q.filter(ContentItem.tenant_id == tenant_id)
    item = q.first()
    if not item:
        raise NotFound("Conteúdo não encontrado")

    if item.is_platform_managed and not user.is_platform_admin:
        raise Forbidden("Somente admin da plataforma remove conteúdo oficial")

    item.is_active = False
    db.add(item)
    db.flush()
    db.add(
        make_audit_event(
            item.tenant_id,
            user.id,
            "DELETE",
            "CONTENT_ITEM",
            item.id,
            None,
            {"soft_delete": True},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Learning Paths
# ---------------------------------------------------------------------------


def _build_learning_path_out(path: LearningPath, items_with_titles: list) -> LearningPathOut:
    """Build a LearningPathOut from a LearningPath and joined item rows."""
    item_outs = [
        LearningPathItemOut(
            id=lpi.id,
            content_item_id=lpi.content_item_id,
            order_index=lpi.order_index,
            content_title=content_title,
        )
        for lpi, content_title in items_with_titles
    ]
    return LearningPathOut(
        id=path.id,
        tenant_id=path.tenant_id,
        title=path.title,
        description=path.description,
        is_platform_managed=path.is_platform_managed,
        items=item_outs,
        created_at=path.created_at,
    )


def _get_path_items_with_titles(db: Session, path_id: UUID) -> list:
    """Return list of (LearningPathItem, content_title) tuples ordered by order_index."""
    return (
        db.query(LearningPathItem, ContentItem.title)
        .outerjoin(ContentItem, LearningPathItem.content_item_id == ContentItem.id)
        .filter(LearningPathItem.learning_path_id == path_id)
        .order_by(LearningPathItem.order_index)
        .all()
    )


@router.post("/learning-paths", response_model=LearningPathOut)
def create_learning_path(
    payload: LearningPathCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    effective_tenant = None if user.is_platform_admin else tenant_id

    path = LearningPath(
        tenant_id=effective_tenant,
        title=payload.title.strip(),
        description=payload.description.strip() if payload.description else None,
        is_platform_managed=user.is_platform_admin,
    )
    db.add(path)
    db.flush()

    for idx, cid in enumerate(payload.content_item_ids):
        lpi = LearningPathItem(
            learning_path_id=path.id,
            content_item_id=cid,
            order_index=idx,
        )
        db.add(lpi)
    db.flush()

    db.add(
        make_audit_event(
            effective_tenant,
            user.id,
            "CREATE",
            "LEARNING_PATH",
            path.id,
            None,
            {"title": path.title, "item_count": len(payload.content_item_ids)},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(path)

    items_with_titles = _get_path_items_with_titles(db, path.id)
    return _build_learning_path_out(path, items_with_titles)


@router.get("/learning-paths", response_model=list[LearningPathOut])
def list_learning_paths(
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    if user.is_platform_admin:
        paths = db.query(LearningPath).order_by(LearningPath.created_at.desc()).all()
    else:
        paths = (
            db.query(LearningPath)
            .filter((LearningPath.tenant_id == None) | (LearningPath.tenant_id == tenant_id))
            .order_by(LearningPath.created_at.desc())
            .all()
        )

    results = []
    for p in paths:
        items_with_titles = _get_path_items_with_titles(db, p.id)
        results.append(_build_learning_path_out(p, items_with_titles))
    return results


@router.get("/learning-paths/{path_id}", response_model=LearningPathOut)
def get_learning_path(
    path_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    q = db.query(LearningPath).filter(LearningPath.id == path_id)
    if not user.is_platform_admin:
        q = q.filter((LearningPath.tenant_id == None) | (LearningPath.tenant_id == tenant_id))
    path = q.first()
    if not path:
        raise NotFound("Trilha de aprendizado não encontrada")

    items_with_titles = _get_path_items_with_titles(db, path.id)
    return _build_learning_path_out(path, items_with_titles)


@router.patch("/learning-paths/{path_id}", response_model=LearningPathOut)
def update_learning_path(
    path_id: UUID,
    payload: LearningPathUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    q = db.query(LearningPath).filter(LearningPath.id == path_id)
    if not user.is_platform_admin:
        q = q.filter(LearningPath.tenant_id == tenant_id)
    path = q.first()
    if not path:
        raise NotFound("Trilha de aprendizado não encontrada")

    if path.is_platform_managed and not user.is_platform_admin:
        raise Forbidden("Somente admin da plataforma edita trilha oficial")

    changes: dict = {}
    if payload.title is not None:
        path.title = payload.title.strip()
        changes["title"] = path.title
    if payload.description is not None:
        path.description = payload.description.strip()
        changes["description"] = path.description

    if payload.content_item_ids is not None:
        # Replace all items: delete existing, create new
        db.query(LearningPathItem).filter(LearningPathItem.learning_path_id == path.id).delete()
        for idx, cid in enumerate(payload.content_item_ids):
            lpi = LearningPathItem(
                learning_path_id=path.id,
                content_item_id=cid,
                order_index=idx,
            )
            db.add(lpi)
        changes["item_count"] = len(payload.content_item_ids)

    db.add(path)
    db.flush()

    if changes:
        db.add(
            make_audit_event(
                path.tenant_id,
                user.id,
                "UPDATE",
                "LEARNING_PATH",
                path.id,
                None,
                changes,
                meta.get("ip"),
                meta.get("user_agent"),
                meta.get("request_id"),
            )
        )

    db.commit()
    db.refresh(path)

    items_with_titles = _get_path_items_with_titles(db, path.id)
    return _build_learning_path_out(path, items_with_titles)


@router.delete("/learning-paths/{path_id}", response_model=dict)
def delete_learning_path(
    path_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    q = db.query(LearningPath).filter(LearningPath.id == path_id)
    if not user.is_platform_admin:
        q = q.filter(LearningPath.tenant_id == tenant_id)
    path = q.first()
    if not path:
        raise NotFound("Trilha de aprendizado não encontrada")

    if path.is_platform_managed and not user.is_platform_admin:
        raise Forbidden("Somente admin da plataforma remove trilha oficial")

    path_tenant = path.tenant_id
    db.delete(path)  # cascade deletes LearningPathItem records
    db.flush()

    db.add(
        make_audit_event(
            path_tenant,
            user.id,
            "DELETE",
            "LEARNING_PATH",
            path_id,
            None,
            {"hard_delete": True},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


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
    user=Depends(require_any_role(_MANAGER_ROLES)),
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
    user=Depends(require_any_role(_MANAGER_ROLES)),
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
    user=Depends(require_any_role(_MANAGER_ROLES)),
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


@router.patch("/assignments/{assignment_id}", response_model=AssignmentOut)
def update_assignment(
    assignment_id: UUID,
    payload: AssignmentUpdate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    r = db.query(ContentAssignment).filter(
        ContentAssignment.id == assignment_id,
        ContentAssignment.tenant_id == tenant_id,
    ).first()
    if not r:
        raise NotFound("Atribuição não encontrada")

    changes: dict = {}
    if payload.due_at is not None:
        r.due_at = payload.due_at
        changes["due_at"] = str(r.due_at)
    if payload.status is not None:
        if payload.status not in ("assigned", "in_progress", "completed"):
            raise BadRequest("Status inválido. Use: assigned, in_progress, completed")
        r.status = payload.status
        changes["status"] = r.status

    if changes:
        db.add(r)
        db.flush()
        db.add(
            make_audit_event(
                tenant_id,
                user.id,
                "UPDATE",
                "CONTENT_ASSIGNMENT",
                r.id,
                None,
                changes,
                meta.get("ip"),
                meta.get("user_agent"),
                meta.get("request_id"),
            )
        )
        db.commit()
        db.refresh(r)

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


@router.delete("/assignments/{assignment_id}", response_model=dict)
def delete_assignment(
    assignment_id: UUID,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    r = db.query(ContentAssignment).filter(
        ContentAssignment.id == assignment_id,
        ContentAssignment.tenant_id == tenant_id,
    ).first()
    if not r:
        raise NotFound("Atribuição não encontrada")

    db.delete(r)
    db.flush()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "DELETE",
            "CONTENT_ASSIGNMENT",
            assignment_id,
            None,
            {"deleted": True},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"deleted": True}


@router.post("/assignments/bulk", response_model=dict)
def bulk_create_assignments(
    payload: BulkAssignmentCreate,
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
    meta: dict = Depends(get_request_meta),
):
    if not payload.content_item_id and not payload.learning_path_id:
        raise BadRequest("Informe content_item_id ou learning_path_id")
    if not payload.employee_ids and not payload.org_unit_ids:
        raise BadRequest("Informe employee_ids ou org_unit_ids")

    created_count = 0

    # Create one assignment per employee
    if payload.employee_ids:
        for eid in payload.employee_ids:
            a = ContentAssignment(
                tenant_id=tenant_id,
                content_item_id=payload.content_item_id,
                learning_path_id=payload.learning_path_id,
                employee_id=eid,
                org_unit_id=None,
                due_at=None,
                status="assigned",
            )
            db.add(a)
            created_count += 1

    # Create one assignment per org unit
    if payload.org_unit_ids:
        for ouid in payload.org_unit_ids:
            a = ContentAssignment(
                tenant_id=tenant_id,
                content_item_id=payload.content_item_id,
                learning_path_id=payload.learning_path_id,
                employee_id=None,
                org_unit_id=ouid,
                due_at=None,
                status="assigned",
            )
            db.add(a)
            created_count += 1

    db.flush()
    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "CONTENT_ASSIGNMENT_BULK",
            None,
            None,
            {
                "content_item_id": str(payload.content_item_id) if payload.content_item_id else None,
                "learning_path_id": str(payload.learning_path_id) if payload.learning_path_id else None,
                "count": created_count,
            },
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    return {"created": created_count}


# ---------------------------------------------------------------------------
# Completions
# ---------------------------------------------------------------------------


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


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=LMSStatsOut)
def get_lms_stats(
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _feat_ok: None = Depends(require_feature("LMS")),
    user=Depends(require_any_role(_MANAGER_ROLES)),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    # Total active contents visible to tenant
    total_contents = (
        db.query(func.count(ContentItem.id))
        .filter(
            ContentItem.is_active == True,
            (ContentItem.tenant_id == None) | (ContentItem.tenant_id == tenant_id),
        )
        .scalar()
    ) or 0

    # Total assignments for tenant
    total_assignments = (
        db.query(func.count(ContentAssignment.id))
        .filter(ContentAssignment.tenant_id == tenant_id)
        .scalar()
    ) or 0

    # Completed assignments
    total_completed = (
        db.query(func.count(ContentAssignment.id))
        .filter(ContentAssignment.tenant_id == tenant_id, ContentAssignment.status == "completed")
        .scalar()
    ) or 0

    # In-progress assignments
    total_in_progress = (
        db.query(func.count(ContentAssignment.id))
        .filter(ContentAssignment.tenant_id == tenant_id, ContentAssignment.status == "in_progress")
        .scalar()
    ) or 0

    # Completion rate
    completion_rate = round((total_completed / total_assignments * 100) if total_assignments > 0 else 0.0, 2)

    # Contents by type
    type_rows = (
        db.query(ContentItem.content_type, func.count(ContentItem.id))
        .filter(
            ContentItem.is_active == True,
            (ContentItem.tenant_id == None) | (ContentItem.tenant_id == tenant_id),
        )
        .group_by(ContentItem.content_type)
        .all()
    )
    contents_by_type = {row[0]: row[1] for row in type_rows}

    # Assignments by status
    status_rows = (
        db.query(ContentAssignment.status, func.count(ContentAssignment.id))
        .filter(ContentAssignment.tenant_id == tenant_id)
        .group_by(ContentAssignment.status)
        .all()
    )
    assignments_by_status = {row[0]: row[1] for row in status_rows}

    return LMSStatsOut(
        total_contents=total_contents,
        total_assignments=total_assignments,
        total_completed=total_completed,
        total_in_progress=total_in_progress,
        completion_rate=completion_rate,
        contents_by_type=contents_by_type,
        assignments_by_status=assignments_by_status,
    )
