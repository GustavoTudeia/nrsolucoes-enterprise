from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_any_role, tenant_id_from_user, require_active_subscription
from app.core.rbac import ROLE_TENANT_ADMIN, ROLE_TENANT_AUDITOR
from app.db.session import get_db
from app.models.audit_event import AuditEvent
from app.models.user import User
from app.schemas.audit import AuditEventOut
from app.schemas.common import Page

router = APIRouter(prefix="/audit")


@router.get("/events", response_model=Page[AuditEventOut])
def list_audit_events(
    action: Optional[str] = Query(default=None, description="CREATE|UPDATE|DELETE|EXPORT|LOGIN"),
    entity_type: Optional[str] = Query(default=None),
    entity_id: Optional[UUID] = Query(default=None),
    actor_user_id: Optional[UUID] = Query(default=None),
    q: Optional[str] = Query(default=None, description="Busca em entity_type e request_id"),
    since: Optional[datetime] = Query(default=None),
    until: Optional[datetime] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _sub_ok: None = Depends(require_active_subscription),
    _user=Depends(require_any_role([ROLE_TENANT_ADMIN, ROLE_TENANT_AUDITOR])),
    tenant_id: UUID = Depends(tenant_id_from_user),
):
    base = db.query(AuditEvent).filter(AuditEvent.tenant_id == tenant_id)

    if action:
        base = base.filter(AuditEvent.action == action)
    if entity_type:
        base = base.filter(AuditEvent.entity_type == entity_type)
    if entity_id:
        base = base.filter(AuditEvent.entity_id == entity_id)
    if actor_user_id:
        base = base.filter(AuditEvent.actor_user_id == actor_user_id)
    if since:
        base = base.filter(AuditEvent.created_at >= since)
    if until:
        base = base.filter(AuditEvent.created_at <= until)
    if q:
        like = f"%{q.strip()}%"
        base = base.filter((AuditEvent.entity_type.ilike(like)) | (AuditEvent.request_id.ilike(like)))

    total = base.count()
    rows = base.order_by(AuditEvent.created_at.desc()).offset(offset).limit(limit).all()

    # Batch-load actor names to avoid N+1
    actor_ids = {r.actor_user_id for r in rows if r.actor_user_id}
    actor_map: dict = {}
    if actor_ids:
        users = db.query(User.id, User.full_name, User.email).filter(User.id.in_(list(actor_ids))).all()
        actor_map = {u.id: (u.full_name, u.email) for u in users}

    items = [
        AuditEventOut(
            id=r.id,
            tenant_id=r.tenant_id,
            actor_user_id=r.actor_user_id,
            actor_name=actor_map.get(r.actor_user_id, (None, None))[0] if r.actor_user_id else None,
            actor_email=actor_map.get(r.actor_user_id, (None, None))[1] if r.actor_user_id else None,
            action=r.action,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            before_json=r.before_json,
            after_json=r.after_json,
            ip=r.ip,
            user_agent=r.user_agent,
            request_id=r.request_id,
            created_at=r.created_at,
        )
        for r in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)
