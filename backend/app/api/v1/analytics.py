from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_employee, require_platform_admin, tenant_id_from_user, tenant_id_from_employee
from app.db.session import get_db
from app.models.analytics import TenantHealthSnapshot, TenantNudge
from app.models.user import User
from app.models.employee import Employee
from app.models.tenant import Tenant
from app.schemas.analytics import BrowserAnalyticsEventIn, AnalyticsTrackOut, TenantHealthOut, TenantNudgeOut, PlatformAnalyticsOverviewOut, PlatformTenantHealthItemOut, WorkflowRunOut
from app.services.analytics_service import capture_analytics_event
from app.services.tenant_health import upsert_tenant_health_snapshot, platform_health_overview
from app.services.retention_workflows import evaluate_retention_workflows
from app.models.billing import TenantSubscription, Plan

public_router = APIRouter(prefix="/analytics")
router = APIRouter(prefix="/analytics")
platform_router = APIRouter(prefix="/platform/analytics")


def _health_out(snapshot: TenantHealthSnapshot) -> TenantHealthOut:
    return TenantHealthOut(
        tenant_id=str(snapshot.tenant_id),
        score=snapshot.score,
        band=snapshot.band,
        activation_status=snapshot.activation_status,
        onboarding_score=snapshot.onboarding_score,
        activation_score=snapshot.activation_score,
        depth_score=snapshot.depth_score,
        routine_score=snapshot.routine_score,
        billing_score=snapshot.billing_score,
        last_value_event_at=snapshot.last_value_event_at,
        last_active_at=snapshot.last_active_at,
        recomputed_at=snapshot.recomputed_at,
        metrics=snapshot.metrics_json or {},
        risk_flags=snapshot.risk_flags_json or [],
        recommendations=snapshot.recommendations_json or [],
    )


@public_router.post("/browser", response_model=AnalyticsTrackOut)
def track_public_browser_event(payload: BrowserAnalyticsEventIn, db: Session = Depends(get_db)):
    event = capture_analytics_event(
        db,
        payload.event_name,
        source=payload.source or "public",
        module=payload.module,
        distinct_key=payload.distinct_key,
        path=payload.path,
        referrer=payload.referrer,
        channel=payload.channel,
        utm_source=payload.utm_source,
        utm_medium=payload.utm_medium,
        utm_campaign=payload.utm_campaign,
        utm_term=payload.utm_term,
        utm_content=payload.utm_content,
        properties=payload.properties,
        commit=True,
    )
    return AnalyticsTrackOut(ok=True, event_name=event.event_name, occurred_at=event.occurred_at)


@router.post("/browser", response_model=AnalyticsTrackOut)
def track_console_browser_event(payload: BrowserAnalyticsEventIn, db: Session = Depends(get_db), user: User = Depends(get_current_user), tenant_id=Depends(tenant_id_from_user)):
    role = (user.roles[0].role.key if getattr(user, 'roles', None) and user.roles and user.roles[0].role else None)
    event = capture_analytics_event(
        db,
        payload.event_name,
        source=payload.source or "console",
        tenant_id=tenant_id,
        user_id=user.id,
        actor_role=role,
        module=payload.module,
        distinct_key=payload.distinct_key or str(user.id),
        path=payload.path,
        referrer=payload.referrer,
        channel=payload.channel,
        utm_source=payload.utm_source,
        utm_medium=payload.utm_medium,
        utm_campaign=payload.utm_campaign,
        utm_term=payload.utm_term,
        utm_content=payload.utm_content,
        properties=payload.properties,
    )
    snapshot = upsert_tenant_health_snapshot(db, tenant_id)
    db.commit()
    return AnalyticsTrackOut(ok=True, event_name=event.event_name, occurred_at=event.occurred_at)


@router.post("/employee/browser", response_model=AnalyticsTrackOut)
def track_employee_browser_event(payload: BrowserAnalyticsEventIn, db: Session = Depends(get_db), employee: Employee = Depends(get_current_employee), tenant_id=Depends(tenant_id_from_employee)):
    event = capture_analytics_event(
        db,
        payload.event_name,
        source=payload.source or "employee",
        tenant_id=tenant_id,
        employee_id=employee.id,
        actor_role="EMPLOYEE",
        module=payload.module,
        distinct_key=payload.distinct_key or str(employee.id),
        path=payload.path,
        referrer=payload.referrer,
        channel=payload.channel,
        utm_source=payload.utm_source,
        utm_medium=payload.utm_medium,
        utm_campaign=payload.utm_campaign,
        utm_term=payload.utm_term,
        utm_content=payload.utm_content,
        properties=payload.properties,
    )
    upsert_tenant_health_snapshot(db, tenant_id)
    db.commit()
    return AnalyticsTrackOut(ok=True, event_name=event.event_name, occurred_at=event.occurred_at)


@router.get("/health", response_model=TenantHealthOut)
def get_current_tenant_health(db: Session = Depends(get_db), _user: User = Depends(get_current_user), tenant_id=Depends(tenant_id_from_user)):
    snapshot = upsert_tenant_health_snapshot(db, tenant_id)
    db.commit()
    db.refresh(snapshot)
    return _health_out(snapshot)


@router.get("/nudges", response_model=list[TenantNudgeOut])
def list_current_tenant_nudges(db: Session = Depends(get_db), _user: User = Depends(get_current_user), tenant_id=Depends(tenant_id_from_user), status: str = Query(default="pending")):
    rows = (
        db.query(TenantNudge)
        .filter(TenantNudge.tenant_id == tenant_id, TenantNudge.status == status)
        .order_by(TenantNudge.created_at.desc())
        .limit(20)
        .all()
    )
    if not rows:
        rows = evaluate_retention_workflows(db, tenant_id, send_emails=False)
        db.commit()
    return [TenantNudgeOut(id=str(r.id), nudge_key=r.nudge_key, channel=r.channel, audience_role=r.audience_role, title=r.title, body=r.body, status=r.status, send_email=r.send_email, due_at=r.due_at, sent_at=r.sent_at, context=r.context_json or {}) for r in rows]


@router.post("/refresh", response_model=TenantHealthOut)
def refresh_current_tenant_health(db: Session = Depends(get_db), _user: User = Depends(get_current_user), tenant_id=Depends(tenant_id_from_user)):
    snapshot = upsert_tenant_health_snapshot(db, tenant_id)
    evaluate_retention_workflows(db, tenant_id, send_emails=False)
    db.commit()
    db.refresh(snapshot)
    return _health_out(snapshot)


@platform_router.get("/overview", response_model=PlatformAnalyticsOverviewOut)
def get_platform_analytics_overview(db: Session = Depends(get_db), _user=Depends(require_platform_admin)):
    return PlatformAnalyticsOverviewOut(**platform_health_overview(db))


@platform_router.get("/tenants", response_model=list[PlatformTenantHealthItemOut])
def list_platform_tenant_health(db: Session = Depends(get_db), _user=Depends(require_platform_admin), band: str | None = Query(default=None)):
    tenants = db.query(Tenant).filter(Tenant.is_active == True).order_by(Tenant.created_at.desc()).all()
    out: list[PlatformTenantHealthItemOut] = []
    for tenant in tenants:
        snap = upsert_tenant_health_snapshot(db, tenant.id)
        if band and snap.band != band:
            continue
        sub = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant.id).first()
        plan_key = None
        if sub and sub.plan_id:
            plan = db.query(Plan).filter(Plan.id == sub.plan_id).first()
            plan_key = plan.key if plan else None
        out.append(PlatformTenantHealthItemOut(
            tenant_id=str(tenant.id),
            tenant_name=tenant.name,
            tenant_slug=tenant.slug,
            plan_key=plan_key,
            billing_status=sub.status if sub else None,
            score=snap.score,
            band=snap.band,
            activation_status=snap.activation_status,
            last_active_at=snap.last_active_at,
            last_value_event_at=snap.last_value_event_at,
            metrics=snap.metrics_json or {},
            risk_flags=snap.risk_flags_json or [],
        ))
    db.commit()
    return out


@platform_router.post("/workflows/run", response_model=WorkflowRunOut)
def run_platform_workflows(db: Session = Depends(get_db), _user=Depends(require_platform_admin), tenant_id: UUID | None = Query(default=None), send_emails: bool = Query(default=False)):
    tenants = [db.query(Tenant).filter(Tenant.id == tenant_id).first()] if tenant_id else db.query(Tenant).filter(Tenant.is_active == True).all()
    tenants = [t for t in tenants if t]
    processed = 0
    generated = 0
    sent = 0
    for tenant in tenants:
        processed += 1
        rows = evaluate_retention_workflows(db, tenant.id, send_emails=send_emails)
        generated += len(rows)
        sent += len([r for r in rows if r.status == "sent"])
    db.commit()
    return WorkflowRunOut(ok=True, processed_tenants=processed, nudges_generated=generated, nudges_sent=sent)
