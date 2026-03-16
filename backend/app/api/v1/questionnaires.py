from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_request_meta
from app.core.audit import make_audit_event
from app.core.errors import Forbidden, NotFound
from app.core.rbac import ROLE_TENANT_ADMIN
from app.db.session import get_db
from app.models.questionnaire import QuestionnaireTemplate, QuestionnaireVersion
from app.schemas.common import Page
from app.schemas.questionnaire import (
    QuestionnaireTemplateCreate,
    QuestionnaireTemplateDetailOut,
    QuestionnaireTemplateOut,
    QuestionnaireVersionCreate,
    QuestionnaireVersionDetailOut,
    QuestionnaireVersionOut,
)

router = APIRouter(prefix="/questionnaires")


def _require_template_access(user, template: QuestionnaireTemplate) -> None:
    # platform admin can access any
    if user.is_platform_admin:
        return

    if not user.tenant_id:
        raise Forbidden("Usuário sem tenant")
    # tenant users can access platform templates (tenant_id == None) and their own (tenant_id == user.tenant_id)
    if template.tenant_id is None:
        return
    if template.tenant_id != user.tenant_id:
        raise Forbidden("Acesso negado")


def _require_template_manage(user, template: QuestionnaireTemplate) -> None:
    # governança: se template oficial, somente platform admin
    if template.is_platform_managed and not user.is_platform_admin:
        raise Forbidden("Somente admin da plataforma gerencia template oficial")

    # se template do tenant, somente TENANT_ADMIN cria versões/publica etc.
    if not template.is_platform_managed:
        if not user.tenant_id or template.tenant_id != user.tenant_id:
            raise Forbidden("Acesso negado")
        keys = [urs.role.key for urs in user.roles]
        if ROLE_TENANT_ADMIN not in keys:
            raise Forbidden("Somente TENANT_ADMIN gerencia versões do template do tenant")


@router.post("/templates", response_model=QuestionnaireTemplateOut)
def create_template(
    payload: QuestionnaireTemplateCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    # Se is_platform_managed, somente admin plataforma pode criar e tenant_id=None
    if payload.is_platform_managed and not user.is_platform_admin:
        raise Forbidden("Somente admin da plataforma cria template oficial")

    tenant_id = None
    if not payload.is_platform_managed:
        if not user.tenant_id:
            raise Forbidden("Usuário sem tenant")
        # somente tenant admin pode criar templates do tenant
        keys = [urs.role.key for urs in user.roles]
        if ROLE_TENANT_ADMIN not in keys:
            raise Forbidden("Somente TENANT_ADMIN cria templates do tenant")
        tenant_id = user.tenant_id

    t = QuestionnaireTemplate(
        tenant_id=tenant_id,
        key=payload.key,
        name=payload.name,
        description=payload.description,
        is_platform_managed=payload.is_platform_managed,
        is_active=True,
    )
    db.add(t)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id,
            user.id,
            "CREATE",
            "QUESTIONNAIRE_TEMPLATE",
            t.id,
            None,
            {"key": t.key},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(t)
    return QuestionnaireTemplateOut(
        id=t.id,
        tenant_id=t.tenant_id,
        key=t.key,
        name=t.name,
        description=t.description,
        is_platform_managed=t.is_platform_managed,
        is_active=t.is_active,
    )


@router.get("/templates", response_model=Page[QuestionnaireTemplateDetailOut])
def list_templates(
    q: Optional[str] = Query(default=None, description="Busca por key/nome"),
    is_active: Optional[bool] = Query(default=True),
    is_platform_managed: Optional[bool] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    base = db.query(QuestionnaireTemplate)

    if not user.is_platform_admin:
        if not user.tenant_id:
            raise Forbidden("Usuário sem tenant")
        base = base.filter(or_(QuestionnaireTemplate.tenant_id == None, QuestionnaireTemplate.tenant_id == user.tenant_id))

    if is_active is not None:
        base = base.filter(QuestionnaireTemplate.is_active == is_active)
    if is_platform_managed is not None:
        base = base.filter(QuestionnaireTemplate.is_platform_managed == is_platform_managed)
    if q:
        like = f"%{q.strip()}%"
        base = base.filter(or_(QuestionnaireTemplate.key.ilike(like), QuestionnaireTemplate.name.ilike(like)))

    total = base.count()
    rows = (
        base.order_by(QuestionnaireTemplate.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = [
        QuestionnaireTemplateDetailOut(
            id=r.id,
            tenant_id=r.tenant_id,
            key=r.key,
            name=r.name,
            description=r.description,
            is_platform_managed=r.is_platform_managed,
            is_active=r.is_active,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/templates/{template_id}", response_model=QuestionnaireTemplateDetailOut)
def get_template(
    template_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    t = db.query(QuestionnaireTemplate).filter(QuestionnaireTemplate.id == template_id).first()
    if not t:
        raise NotFound("Template não encontrado")
    _require_template_access(user, t)
    return QuestionnaireTemplateDetailOut(
        id=t.id,
        tenant_id=t.tenant_id,
        key=t.key,
        name=t.name,
        description=t.description,
        is_platform_managed=t.is_platform_managed,
        is_active=t.is_active,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.post("/templates/{template_id}/versions", response_model=QuestionnaireVersionOut)
def create_version(
    template_id: UUID,
    payload: QuestionnaireVersionCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    t = db.query(QuestionnaireTemplate).filter(QuestionnaireTemplate.id == template_id).first()
    if not t:
        raise NotFound("Template não encontrado")
    _require_template_manage(user, t)

    # next version number
    max_v = (
        db.query(QuestionnaireVersion)
        .filter(QuestionnaireVersion.template_id == t.id)
        .order_by(QuestionnaireVersion.version.desc())
        .first()
    )
    next_ver = (max_v.version + 1) if max_v else 1

    v = QuestionnaireVersion(template_id=t.id, version=next_ver, status="draft", content=payload.content)
    db.add(v)
    db.flush()
    db.add(
        make_audit_event(
            t.tenant_id,
            user.id,
            "CREATE",
            "QUESTIONNAIRE_VERSION",
            v.id,
            None,
            {"version": v.version, "template_id": str(t.id)},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(v)
    return QuestionnaireVersionOut(
        id=v.id, template_id=v.template_id, version=v.version, status=v.status, content=v.content
    )


@router.get("/templates/{template_id}/versions", response_model=Page[QuestionnaireVersionDetailOut])
def list_versions(
    template_id: UUID,
    status: Optional[str] = Query(default=None, description="draft|published|archived"),
    published_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    t = db.query(QuestionnaireTemplate).filter(QuestionnaireTemplate.id == template_id).first()
    if not t:
        raise NotFound("Template não encontrado")
    _require_template_access(user, t)

    base = db.query(QuestionnaireVersion).filter(QuestionnaireVersion.template_id == t.id)

    if published_only:
        base = base.filter(QuestionnaireVersion.status == "published")
    elif status:
        base = base.filter(QuestionnaireVersion.status == status)

    total = base.count()
    rows = base.order_by(QuestionnaireVersion.version.desc()).offset(offset).limit(limit).all()
    items = [
        QuestionnaireVersionDetailOut(
            id=r.id,
            template_id=r.template_id,
            version=r.version,
            status=r.status,
            content=r.content,
            created_at=r.created_at,
            updated_at=r.updated_at,
            published_at=r.published_at,
        )
        for r in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/versions/{version_id}", response_model=QuestionnaireVersionDetailOut)
def get_version(
    version_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    v = db.query(QuestionnaireVersion).filter(QuestionnaireVersion.id == version_id).first()
    if not v:
        raise NotFound("Versão não encontrada")
    t = db.query(QuestionnaireTemplate).filter(QuestionnaireTemplate.id == v.template_id).first()
    if not t:
        raise NotFound("Template não encontrado")
    _require_template_access(user, t)

    return QuestionnaireVersionDetailOut(
        id=v.id,
        template_id=v.template_id,
        version=v.version,
        status=v.status,
        content=v.content,
        created_at=v.created_at,
        updated_at=v.updated_at,
        published_at=v.published_at,
    )


@router.post("/versions/{version_id}/publish", response_model=QuestionnaireVersionOut)
def publish_version(
    version_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    meta: dict = Depends(get_request_meta),
):
    v = db.query(QuestionnaireVersion).filter(QuestionnaireVersion.id == version_id).first()
    if not v:
        raise NotFound("Versão não encontrada")
    t = db.query(QuestionnaireTemplate).filter(QuestionnaireTemplate.id == v.template_id).first()
    if not t:
        raise NotFound("Template não encontrado")

    _require_template_manage(user, t)

    v.status = "published"
    v.published_at = datetime.utcnow()
    db.add(
        make_audit_event(
            t.tenant_id,
            user.id,
            "UPDATE",
            "QUESTIONNAIRE_VERSION",
            v.id,
            None,
            {"status": "published"},
            meta.get("ip"),
            meta.get("user_agent"),
            meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(v)
    return QuestionnaireVersionOut(id=v.id, template_id=v.template_id, version=v.version, status=v.status, content=v.content)


@router.get("/published", response_model=QuestionnaireVersionDetailOut)
def get_latest_published_by_key(
    key: str = Query(..., description="template key (ex.: nr1_governanca_evidencias)"),
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    # Resolve template visível ao usuário
    tq = db.query(QuestionnaireTemplate).filter(QuestionnaireTemplate.key == key, QuestionnaireTemplate.is_active == True)
    if user.is_platform_admin:
        t = tq.order_by(QuestionnaireTemplate.created_at.desc()).first()
    else:
        if not user.tenant_id:
            raise Forbidden("Usuário sem tenant")
        t = tq.filter(or_(QuestionnaireTemplate.tenant_id == None, QuestionnaireTemplate.tenant_id == user.tenant_id)).order_by(QuestionnaireTemplate.created_at.desc()).first()

    if not t:
        raise NotFound("Template não encontrado")

    v = (
        db.query(QuestionnaireVersion)
        .filter(QuestionnaireVersion.template_id == t.id, QuestionnaireVersion.status == "published")
        .order_by(QuestionnaireVersion.version.desc())
        .first()
    )
    if not v:
        raise NotFound("Nenhuma versão publicada para este template")

    return QuestionnaireVersionDetailOut(
        id=v.id,
        template_id=v.template_id,
        version=v.version,
        status=v.status,
        content=v.content,
        created_at=v.created_at,
        updated_at=v.updated_at,
        published_at=v.published_at,
    )
