from __future__ import annotations

import uuid
from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_platform_admin, get_request_meta
from app.core.audit import make_audit_event
from app.core.errors import NotFound, BadRequest
from app.db.session import get_db
from app.models.billing import Plan, TenantSubscription
from app.models.tenant import Tenant
from app.schemas.platform_admin import PlanAdminOut, TenantPlanChangeIn
from app.services.entitlements import apply_plan_to_subscription


router = APIRouter(prefix="/platform")


@router.get("/plans", response_model=List[PlanAdminOut])
def list_plans(db: Session = Depends(get_db), admin=Depends(require_platform_admin)):
    rows = db.query(Plan).order_by(Plan.key.asc()).all()
    return [
        PlanAdminOut(
            id=p.id,
            key=p.key,
            name=p.name,
            features=p.features or {},
            limits=p.limits or {},
            stripe_price_id=p.stripe_price_id,
            is_active=p.is_active,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in rows
    ]


@router.put("/tenants/{tenant_id}/plan", response_model=dict)
def set_tenant_plan(
    tenant_id: UUID,
    payload: TenantPlanChangeIn,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise NotFound("Tenant não encontrado")

    plan_key = (payload.plan_key or "").strip().upper()
    plan = db.query(Plan).filter(Plan.key == plan_key, Plan.is_active == True).first()
    if not plan:
        raise BadRequest("Plano inválido ou inativo")

    # captura o estado anterior (se existir)
    existing = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()
    before = None
    if existing:
        before = {
            "plan_id": str(existing.plan_id) if existing.plan_id else None,
            "status": existing.status,
            "entitlements_snapshot": existing.entitlements_snapshot,
        }

    # aplica o plano e recalcula snapshot (idempotente)
    desired_status = payload.status or (existing.status if existing else "active")
    sub = apply_plan_to_subscription(db, tenant_id, plan, status=desired_status)

    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="UPDATE",
            entity_type="TENANT_SUBSCRIPTION",
            entity_id=sub.id,
            before=before,
            after={"tenant_id": str(tenant_id), "plan_key": plan.key, "status": sub.status},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    return {"ok": True, "tenant_id": str(tenant_id), "plan_key": plan.key, "status": sub.status}
