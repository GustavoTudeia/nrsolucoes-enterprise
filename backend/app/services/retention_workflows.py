from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.analytics import TenantNudge
from app.models.billing import BillingProfile, TenantSubscription
from app.models.tenant import Tenant
from app.models.user import User
from app.services.email_service import email_service
from app.services.tenant_health import compute_tenant_health, upsert_tenant_health_snapshot


def _pick_recipient_email(db: Session, tenant_id: UUID, audience_role: str | None) -> tuple[str | None, UUID | None]:
    profile = db.query(BillingProfile).filter(BillingProfile.tenant_id == tenant_id).first()
    if audience_role == "financeiro" and profile and (profile.finance_email or profile.contact_email):
        return profile.finance_email or profile.contact_email, None
    user = db.query(User).filter(User.tenant_id == tenant_id, User.is_active == True).order_by(User.created_at.asc()).first()
    if user and user.email:
        return user.email, user.id
    if profile and profile.contact_email:
        return profile.contact_email, None
    return None, None


def _nudge_exists_recently(db: Session, tenant_id: UUID, nudge_key: str, within_hours: int = 48) -> bool:
    cutoff = datetime.utcnow() - timedelta(hours=within_hours)
    existing = (
        db.query(TenantNudge)
        .filter(TenantNudge.tenant_id == tenant_id, TenantNudge.nudge_key == nudge_key, TenantNudge.created_at >= cutoff)
        .first()
    )
    return existing is not None


def evaluate_retention_workflows(db: Session, tenant_id: UUID, *, send_emails: bool = False) -> list[TenantNudge]:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        return []

    snapshot = upsert_tenant_health_snapshot(db, tenant_id)
    health = compute_tenant_health(db, tenant_id)
    created: list[TenantNudge] = []
    tenant_age_days = max((datetime.utcnow() - tenant.created_at).days, 0) if tenant.created_at else 0

    for rec in health.recommendations:
        if _nudge_exists_recently(db, tenant_id, rec["key"]):
            continue
        should_create = False
        if rec["key"] == "complete_org_setup" and tenant_age_days >= 1:
            should_create = True
        elif rec["key"] == "start_first_workflow" and tenant_age_days >= 3:
            should_create = True
        elif rec["key"] == "collect_first_response" and tenant_age_days >= 5:
            should_create = True
        elif rec["key"] == "create_action_plan" and tenant_age_days >= 7:
            should_create = True
        elif rec["key"] in {"recover_payment", "engage_second_role", "complete_billing_profile", "formalize_pgr", "create_first_employee"}:
            should_create = True
        if not should_create:
            continue

        recipient_email, user_id = _pick_recipient_email(db, tenant_id, rec.get("audience_role"))
        nudge = TenantNudge(
            tenant_id=tenant_id,
            user_id=user_id,
            nudge_key=rec["key"],
            channel="email" if send_emails and recipient_email else "in_app",
            audience_role=rec.get("audience_role"),
            recipient_email=recipient_email,
            title=rec["title"],
            body=rec["body"],
            send_email=bool(send_emails and recipient_email),
            status="pending",
            due_at=datetime.utcnow(),
            context_json={"cta_label": rec.get("cta_label"), "cta_href": rec.get("cta_href"), "health_band": snapshot.band, "health_score": snapshot.score},
        )
        db.add(nudge)
        db.flush()
        if nudge.send_email and settings.ANALYTICS_RETENTION_EMAILS_ENABLED and recipient_email:
            ok = email_service.queue_operational_nudge(
                to_email=recipient_email,
                title=rec["title"],
                message=rec["body"],
                cta_label=rec.get("cta_label"),
                cta_url=f"{settings.FRONTEND_URL}{rec.get('cta_href')}" if rec.get("cta_href") else None,
                tenant_name=tenant.name,
            )
            nudge.channel = "email"
            nudge.status = "sent" if ok else "error"
            nudge.sent_at = datetime.utcnow() if ok else None
        created.append(nudge)

    db.flush()
    return created
