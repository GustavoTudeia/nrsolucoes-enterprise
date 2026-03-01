from __future__ import annotations
from typing import Any, Dict, cast

from sqlalchemy.orm import Session
from uuid import UUID

from app.core.entitlements import Entitlements
from app.models.billing import TenantSubscription, Plan


def resolve_entitlements(db: Session, tenant_id: UUID) -> Entitlements:
    sub = (
        db.query(TenantSubscription)
        .filter(TenantSubscription.tenant_id == tenant_id)
        .first()
    )
    if sub is not None and sub.entitlements_snapshot is not None:
        snap = sub.entitlements_snapshot or {}
        return Entitlements(
            features=snap.get("features", {}) or {}, limits=snap.get("limits", {}) or {}
        )

    if sub is not None and sub.plan_id is not None:
        plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
        if plan is not None:
            return Entitlements(
                features=cast(Dict[str, Any], plan.features or {}),
                limits=cast(Dict[str, Any], plan.limits or {}),
            )
        if plan:
            return Entitlements(features=plan.features or {}, limits=plan.limits or {})
    return Entitlements(features={}, limits={})


# Adicione isso ao final do arquivo backend/app/services/entitlements.py


def resolve_entitlements_for_user(db: Session, user: Any) -> Entitlements:
    """
    Esta é a função que o billing.py está tentando importar.
    Ela extrai o tenant_id do usuário e chama a lógica de permissões.
    """
    tenant_id = getattr(user, "tenant_id", None)
    if not tenant_id:
        return Entitlements(features={}, limits={})

    return resolve_entitlements(db, tenant_id)


def apply_plan_to_subscription(
    db: Session, tenant_id: UUID, plan: Plan, status: str = "active"
) -> TenantSubscription:
    sub = (
        db.query(TenantSubscription)
        .filter(TenantSubscription.tenant_id == tenant_id)
        .first()
    )
    if not sub:
        sub = TenantSubscription(
            tenant_id=tenant_id, status=status, entitlements_snapshot={}
        )
        db.add(sub)
        db.flush()
    sub.plan_id = cast(Any, plan.id)
    sub.status = cast(Any, status)
    sub.entitlements_snapshot = cast(
        Any,
        {
            "features": plan.features or {},
            "limits": plan.limits or {},
        },
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub
