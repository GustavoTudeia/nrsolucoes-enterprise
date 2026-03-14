from __future__ import annotations

import uuid
from uuid import UUID
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_platform_admin, get_request_meta
from app.core.audit import make_audit_event
from app.core.errors import NotFound, BadRequest, Conflict
from app.db.session import get_db
from app.models.billing import Plan, TenantSubscription
from app.models.tenant import Tenant
from app.schemas.platform_admin import PlanAdminOut, PlanCreateIn, PlanUpdateIn, TenantPlanChangeIn
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
            price_monthly=p.price_monthly,
            price_annual=p.price_annual,
            is_custom_price=p.is_custom_price or False,
            stripe_price_id=p.stripe_price_id,
            is_active=p.is_active,
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in rows
    ]


@router.post("/plans", response_model=PlanAdminOut, status_code=201)
def create_plan(
    payload: PlanCreateIn,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    key = payload.key.strip().upper()
    existing = db.query(Plan).filter(Plan.key == key).first()
    if existing:
        raise Conflict(f"Plano com key '{key}' já existe")

    plan = Plan(
        key=key,
        name=payload.name,
        features=payload.features,
        limits=payload.limits,
        price_monthly=payload.price_monthly,
        price_annual=payload.price_annual,
        is_custom_price=payload.is_custom_price,
        stripe_price_id=payload.stripe_price_id,
        is_active=payload.is_active,
    )
    db.add(plan)
    db.flush()

    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="CREATE",
            entity_type="PLAN",
            entity_id=plan.id,
            before=None,
            after={"key": key, "name": plan.name},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(plan)
    return PlanAdminOut(
        id=plan.id,
        key=plan.key,
        name=plan.name,
        features=plan.features or {},
        limits=plan.limits or {},
        price_monthly=plan.price_monthly,
        price_annual=plan.price_annual,
        is_custom_price=plan.is_custom_price or False,
        stripe_price_id=plan.stripe_price_id,
        is_active=plan.is_active,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


@router.put("/plans/{plan_id}", response_model=PlanAdminOut)
def update_plan(
    plan_id: UUID,
    payload: PlanUpdateIn,
    db: Session = Depends(get_db),
    admin=Depends(require_platform_admin),
    meta: dict = Depends(get_request_meta),
):
    plan = db.query(Plan).filter(Plan.id == plan_id).first()
    if not plan:
        raise NotFound("Plano não encontrado")

    before = {"name": plan.name, "features": plan.features, "limits": plan.limits,
              "stripe_price_id": plan.stripe_price_id, "is_active": plan.is_active}

    if payload.name is not None:
        plan.name = payload.name
    if payload.features is not None:
        plan.features = payload.features
    if payload.limits is not None:
        plan.limits = payload.limits
    if payload.price_monthly is not None:
        plan.price_monthly = payload.price_monthly
    if payload.price_annual is not None:
        plan.price_annual = payload.price_annual
    if payload.is_custom_price is not None:
        plan.is_custom_price = payload.is_custom_price
    if payload.stripe_price_id is not None:
        plan.stripe_price_id = payload.stripe_price_id
    if payload.is_active is not None:
        plan.is_active = payload.is_active

    db.add(
        make_audit_event(
            tenant_id=None,
            actor_user_id=admin.id,
            action="UPDATE",
            entity_type="PLAN",
            entity_id=plan.id,
            before=before,
            after={"name": plan.name, "features": plan.features, "limits": plan.limits,
                   "stripe_price_id": plan.stripe_price_id, "is_active": plan.is_active},
            ip=meta.get("ip"),
            user_agent=meta.get("user_agent"),
            request_id=meta.get("request_id"),
        )
    )
    db.commit()
    db.refresh(plan)
    return PlanAdminOut(
        id=plan.id,
        key=plan.key,
        name=plan.name,
        features=plan.features or {},
        limits=plan.limits or {},
        price_monthly=plan.price_monthly,
        price_annual=plan.price_annual,
        is_custom_price=plan.is_custom_price or False,
        stripe_price_id=plan.stripe_price_id,
        is_active=plan.is_active,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


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
