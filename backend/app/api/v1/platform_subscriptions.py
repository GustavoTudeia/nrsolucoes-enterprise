from __future__ import annotations

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_platform_admin, get_request_meta
from app.core.audit import make_audit_event
from app.core.errors import NotFound, BadRequest
from app.db.session import get_db
from app.models.billing import Plan, TenantSubscription
from app.models.tenant import Tenant
from app.schemas.platform_admin import (
    SubscriptionAdminOut,
    SubscriptionStatusChangeIn,
    SubscriptionStatsOut,
)

router = APIRouter(prefix="/platform")


@router.get("/subscriptions", response_model=dict)
def list_subscriptions(
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
):
    query = (
        db.query(TenantSubscription, Tenant, Plan)
        .join(Tenant, TenantSubscription.tenant_id == Tenant.id)
        .outerjoin(Plan, TenantSubscription.plan_id == Plan.id)
    )
    if status:
        query = query.filter(TenantSubscription.status == status)
    if q:
        query = query.filter(Tenant.name.ilike(f"%{q}%"))

    total = query.count()
    rows = query.order_by(Tenant.name.asc()).offset(offset).limit(limit).all()

    items = [
        SubscriptionAdminOut(
            id=sub.id,
            tenant_id=sub.tenant_id,
            tenant_name=t.name,
            plan_key=p.key if p else None,
            plan_name=p.name if p else None,
            status=sub.status,
            period_start=sub.current_period_start,
            period_end=sub.current_period_end,
            created_at=sub.created_at,
            updated_at=sub.updated_at,
        )
        for sub, t, p in rows
    ]
    return {"items": [i.model_dump(mode="json") for i in items], "total": total, "limit": limit, "offset": offset}


@router.put("/subscriptions/{tenant_id}/status", response_model=dict)
def change_subscription_status(
    tenant_id: UUID,
    payload: SubscriptionStatusChangeIn,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    if not sub:
        raise NotFound("Assinatura não encontrada para este tenant")

    before_status = sub.status
    sub.status = payload.status

    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="UPDATE",
            entity_type="TENANT_SUBSCRIPTION",
            entity_id=sub.id,
            before={"status": before_status},
            after={"status": payload.status},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    return {"ok": True, "tenant_id": str(tenant_id), "status": payload.status}


@router.get("/subscriptions/stats", response_model=SubscriptionStatsOut)
def subscription_stats(
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
):
    rows = (
        db.query(TenantSubscription.status, func.count(TenantSubscription.id))
        .group_by(TenantSubscription.status)
        .all()
    )
    by_status = {status: count for status, count in rows}
    total = sum(by_status.values())
    active_count = by_status.get("active", 0)
    return SubscriptionStatsOut(total=total, by_status=by_status, active_count=active_count)
