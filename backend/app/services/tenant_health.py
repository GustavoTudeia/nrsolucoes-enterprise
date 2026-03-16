from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.analytics import AnalyticsEvent, TenantHealthSnapshot
from app.models.action_plan import ActionItem, ActionEvidence
from app.models.billing import BillingInvoice, BillingProfile, TenantSubscription
from app.models.campaign import Campaign, SurveyResponse
from app.models.employee import Employee
from app.models.esocial import ESocialS2210Accident, ESocialS2220Exam, ESocialS2240Profile
from app.models.inventory import RiskInventoryItem
from app.models.lms import ContentCompletion
from app.models.org import CNPJ, OrgUnit
from app.models.pgr_governance import ErgonomicAssessment, PGRDocumentApproval
from app.models.tenant import Tenant
from app.models.user import User
from app.services.finance_service import billing_profile_is_complete

VALUE_EVENTS = {
    "questionnaire_submitted",
    "inventory_item_reviewed",
    "inventory_item_approved",
    "action_plan_created",
    "action_completed",
    "evidence_uploaded",
    "report_exported",
    "pgr_formalized",
    "training_completed",
    "esocial_export_generated",
}


@dataclass
class HealthResult:
    tenant_id: UUID
    score: int
    band: str
    activation_status: str
    onboarding_score: int
    activation_score: int
    depth_score: int
    routine_score: int
    billing_score: int
    metrics: dict[str, Any]
    recommendations: list[dict[str, Any]]
    risk_flags: list[str]
    last_value_event_at: datetime | None
    last_active_at: datetime | None


BAND_THRESHOLDS = [(80, "healthy"), (60, "attention"), (40, "risk"), (0, "critical")]


def _band_for(score: int) -> str:
    for min_score, band in BAND_THRESHOLDS:
        if score >= min_score:
            return band
    return "critical"


def _recent_window() -> datetime:
    return datetime.utcnow() - timedelta(days=max(settings.ANALYTICS_HEALTH_LOOKBACK_DAYS, 7))


def _count(q) -> int:
    return int(q.scalar() or 0)


def _make_recommendation(key: str, severity: str, title: str, body: str, cta_label: str | None = None, cta_href: str | None = None, audience_role: str | None = None) -> dict[str, Any]:
    return {
        "key": key,
        "severity": severity,
        "title": title,
        "body": body,
        "cta_label": cta_label,
        "cta_href": cta_href,
        "audience_role": audience_role,
    }


def compute_tenant_health(db: Session, tenant_id: UUID) -> HealthResult:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise ValueError("Tenant não encontrado")

    now = datetime.utcnow()
    recent_since = _recent_window()

    profile = db.query(BillingProfile).filter(BillingProfile.tenant_id == tenant_id).first()
    subscription = db.query(TenantSubscription).filter(TenantSubscription.tenant_id == tenant_id).first()

    cnpjs = _count(db.query(func.count(CNPJ.id)).filter(CNPJ.tenant_id == tenant_id))
    units = _count(db.query(func.count(OrgUnit.id)).filter(OrgUnit.tenant_id == tenant_id))
    active_users = _count(db.query(func.count(User.id)).filter(User.tenant_id == tenant_id, User.is_active == True))
    employees = _count(db.query(func.count(Employee.id)).filter(Employee.tenant_id == tenant_id, Employee.is_active == True))

    campaigns = _count(db.query(func.count(Campaign.id)).filter(Campaign.tenant_id == tenant_id))
    responses = _count(
        db.query(func.count(SurveyResponse.id))
        .join(Campaign, Campaign.id == SurveyResponse.campaign_id)
        .filter(Campaign.tenant_id == tenant_id)
    )
    inventory_items = _count(db.query(func.count(RiskInventoryItem.id)).filter(RiskInventoryItem.tenant_id == tenant_id))
    inventory_reviewed = _count(db.query(func.count(RiskInventoryItem.id)).filter(RiskInventoryItem.tenant_id == tenant_id, RiskInventoryItem.reviewed_at.isnot(None)))
    inventory_approved = _count(db.query(func.count(RiskInventoryItem.id)).filter(RiskInventoryItem.tenant_id == tenant_id, RiskInventoryItem.status == "approved"))
    action_items = _count(db.query(func.count(ActionItem.id)).filter(ActionItem.tenant_id == tenant_id))
    action_done = _count(db.query(func.count(ActionItem.id)).filter(ActionItem.tenant_id == tenant_id, ActionItem.status == "done"))
    evidences = _count(db.query(func.count(ActionEvidence.id)).join(ActionItem, ActionItem.id == ActionEvidence.action_item_id).filter(ActionItem.tenant_id == tenant_id))
    pgr_formalizations = _count(db.query(func.count(PGRDocumentApproval.id)).filter(PGRDocumentApproval.tenant_id == tenant_id, PGRDocumentApproval.status == "active"))
    ergonomics = _count(db.query(func.count(ErgonomicAssessment.id)).filter(ErgonomicAssessment.tenant_id == tenant_id))
    completed_trainings = _count(db.query(func.count(ContentCompletion.id)).filter(ContentCompletion.tenant_id == tenant_id, ContentCompletion.completed_at.isnot(None)))
    esocial_records = (
        _count(db.query(func.count(ESocialS2240Profile.id)).filter(ESocialS2240Profile.tenant_id == tenant_id))
        + _count(db.query(func.count(ESocialS2210Accident.id)).filter(ESocialS2210Accident.tenant_id == tenant_id))
        + _count(db.query(func.count(ESocialS2220Exam.id)).filter(ESocialS2220Exam.tenant_id == tenant_id))
    )

    recent_events = db.query(AnalyticsEvent).filter(AnalyticsEvent.tenant_id == tenant_id, AnalyticsEvent.occurred_at >= recent_since)
    last_active_row = recent_events.order_by(AnalyticsEvent.occurred_at.desc()).with_entities(AnalyticsEvent.occurred_at).first()
    last_active_at = last_active_row[0] if last_active_row else None
    last_value_row = recent_events.filter(AnalyticsEvent.event_name.in_(VALUE_EVENTS)).order_by(AnalyticsEvent.occurred_at.desc()).with_entities(AnalyticsEvent.occurred_at).first()
    last_value_at = last_value_row[0] if last_value_row else None

    recent_roles = [r[0] for r in recent_events.with_entities(AnalyticsEvent.actor_role).distinct().all() if r[0]]
    active_roles_30d = len(set(recent_roles))
    recent_modules = [r[0] for r in recent_events.with_entities(AnalyticsEvent.module).distinct().all() if r[0]]
    modules_30d = len(set(recent_modules))
    value_events_30d = _count(recent_events.filter(AnalyticsEvent.event_name.in_(VALUE_EVENTS)).with_entities(func.count(AnalyticsEvent.id)))

    billing_status = subscription.status if subscription else "none"
    recent_failed_payments = _count(db.query(func.count(BillingInvoice.id)).filter(BillingInvoice.tenant_id == tenant_id, BillingInvoice.payment_status.in_(["open", "past_due", "uncollectible"])))
    payment_risk = billing_status in {"past_due", "canceled", "unpaid", "incomplete"} or recent_failed_payments > 0

    onboarding_score = 0
    onboarding_score += 5 if billing_profile_is_complete(profile) else 0
    onboarding_score += 5 if cnpjs > 0 else 0
    onboarding_score += 5 if units > 0 else 0
    onboarding_score += 5 if active_users > 1 else 0
    onboarding_score += 10 if employees > 0 else 0

    activation_score = 0
    activation_score += 10 if (campaigns > 0 or inventory_items > 0) else 0
    activation_score += 5 if (responses > 0 or inventory_reviewed > 0) else 0
    activation_score += 5 if action_items > 0 else 0
    activation_score += 5 if (evidences > 0 or pgr_formalizations > 0) else 0

    depth_score = 0
    depth_score += 5 if modules_30d >= 2 or (campaigns > 0 and inventory_items > 0) else 0
    depth_score += 5 if active_roles_30d >= 2 else 0
    depth_score += 5 if value_events_30d >= 5 or action_done > 0 else 0
    depth_score += 5 if (pgr_formalizations > 0 or esocial_records > 0) else 0

    routine_score = 0
    routine_score += 5 if active_roles_30d >= 1 and last_active_at and last_active_at >= now - timedelta(days=7) else 0
    routine_score += 5 if (inventory_reviewed > 0 or ergonomics > 0) else 0
    routine_score += 5 if (completed_trainings > 0 or action_done > 0) else 0

    billing_score = 0
    billing_score += 5 if billing_status in {"active", "trial"} else 0
    billing_score += 5 if not payment_risk else 0

    score = onboarding_score + activation_score + depth_score + routine_score + billing_score
    band = _band_for(score)

    if activation_score == 0:
        activation_status = "not_started"
    elif activation_score < 25:
        activation_status = "in_progress"
    else:
        activation_status = "activated"

    metrics = {
        "tenant_age_days": max((now - tenant.created_at).days, 0) if tenant.created_at else 0,
        "cnpjs": cnpjs,
        "units": units,
        "active_users": active_users,
        "employees": employees,
        "campaigns": campaigns,
        "responses": responses,
        "inventory_items": inventory_items,
        "inventory_reviewed": inventory_reviewed,
        "inventory_approved": inventory_approved,
        "action_items": action_items,
        "action_done": action_done,
        "evidences": evidences,
        "pgr_formalizations": pgr_formalizations,
        "ergonomics_assessments": ergonomics,
        "completed_trainings": completed_trainings,
        "esocial_records": esocial_records,
        "active_roles_30d": active_roles_30d,
        "modules_30d": modules_30d,
        "value_events_30d": value_events_30d,
        "billing_status": billing_status,
        "payment_risk": payment_risk,
    }

    recommendations: list[dict[str, Any]] = []
    risk_flags: list[str] = []

    if cnpjs == 0:
        recommendations.append(_make_recommendation("complete_org_setup", "high", "Cadastre o primeiro CNPJ", "Sem CNPJ cadastrado, a implantação não avança para inventário, campanhas e governança auditável.", "Cadastrar CNPJ", "/org/cnpjs", "tenant_admin"))
        risk_flags.append("org_setup_missing")
    if cnpjs > 0 and employees == 0:
        recommendations.append(_make_recommendation("create_first_employee", "high", "Cadastre o primeiro colaborador", "Sem colaboradores, você não consegue coletar respostas nem distribuir treinamentos.", "Abrir colaboradores", "/colaboradores", "tenant_admin"))
        risk_flags.append("employees_missing")
    if campaigns == 0 and inventory_items == 0:
        recommendations.append(_make_recommendation("start_first_workflow", "high", "Inicie a primeira campanha ou inventário", "A conta ainda não chegou ao primeiro valor operacional. Comece publicando uma campanha ou registrando o primeiro item do inventário NR-1.", "Começar agora", "/onboarding", "tenant_admin"))
        risk_flags.append("activation_not_started")
    if campaigns > 0 and responses == 0:
        recommendations.append(_make_recommendation("collect_first_response", "medium", "Colete a primeira resposta", "Você já publicou campanha, mas ainda não há resposta enviada. Reenvie convites e acompanhe a taxa de participação.", "Ver campanhas", "/campanhas", "gestor_sst"))
        risk_flags.append("responses_missing")
    if (responses > 0 or inventory_reviewed > 0) and action_items == 0:
        recommendations.append(_make_recommendation("create_action_plan", "medium", "Transforme diagnóstico em plano de ação", "Há sinais de uso, mas o fluxo ainda não chegou ao plano de ação e evidências. Esse é o ponto que mais reduz churn e aumenta valor percebido.", "Abrir plano de ação", "/plano-acao", "gestor_sst"))
        risk_flags.append("action_plan_missing")
    if active_roles_30d < 2:
        recommendations.append(_make_recommendation("engage_second_role", "medium", "Engaje um segundo ator na rotina", "A adoção está concentrada demais em um único papel. Convide gestor, financeiro ou colaborador para reduzir risco de churn por uso individual.", "Gerenciar usuários", "/settings", "tenant_admin"))
        risk_flags.append("single_actor_dependency")
    if payment_risk:
        recommendations.append(_make_recommendation("recover_payment", "high", "Regularize a cobrança", "Existe risco financeiro ativo. Atualize método de pagamento ou trate a fatura pendente antes da renovação.", "Abrir billing", "/billing", "financeiro"))
        risk_flags.append("payment_risk")
    if pgr_formalizations == 0 and inventory_items > 0:
        recommendations.append(_make_recommendation("formalize_pgr", "low", "Formalize o inventário/PGR", "Você já tem inventário registrado. Formalize a versão vigente para aumentar governança e previsibilidade na renovação.", "Abrir inventário", "/inventario", "tenant_admin"))
    if not billing_profile_is_complete(profile):
        recommendations.append(_make_recommendation("complete_billing_profile", "medium", "Complete o perfil de faturamento", "Completar o perfil fiscal reduz atrito de cobrança, nota fiscal e renovação.", "Abrir billing", "/billing", "financeiro"))

    return HealthResult(
        tenant_id=tenant_id,
        score=score,
        band=band,
        activation_status=activation_status,
        onboarding_score=onboarding_score,
        activation_score=activation_score,
        depth_score=depth_score,
        routine_score=routine_score,
        billing_score=billing_score,
        metrics=metrics,
        recommendations=recommendations,
        risk_flags=risk_flags,
        last_value_event_at=last_value_at,
        last_active_at=last_active_at,
    )


def upsert_tenant_health_snapshot(db: Session, tenant_id: UUID) -> TenantHealthSnapshot:
    result = compute_tenant_health(db, tenant_id)
    row = db.query(TenantHealthSnapshot).filter(TenantHealthSnapshot.tenant_id == tenant_id).first()
    if not row:
        row = TenantHealthSnapshot(tenant_id=tenant_id)
        db.add(row)
        db.flush()
    row.score = result.score
    row.band = result.band
    row.activation_status = result.activation_status
    row.onboarding_score = result.onboarding_score
    row.activation_score = result.activation_score
    row.depth_score = result.depth_score
    row.routine_score = result.routine_score
    row.billing_score = result.billing_score
    row.metrics_json = result.metrics
    row.recommendations_json = result.recommendations
    row.risk_flags_json = result.risk_flags
    row.last_value_event_at = result.last_value_event_at
    row.last_active_at = result.last_active_at
    row.recomputed_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def platform_health_overview(db: Session) -> dict[str, Any]:
    tenants = db.query(Tenant).filter(Tenant.is_active == True).all()
    total = len(tenants)
    snapshots = [upsert_tenant_health_snapshot(db, t.id) for t in tenants]
    if total == 0:
        return {
            "total_tenants": 0,
            "activated_tenants": 0,
            "healthy_tenants": 0,
            "attention_tenants": 0,
            "risk_tenants": 0,
            "critical_tenants": 0,
            "average_health_score": 0.0,
            "onboarding_completion_rate": 0.0,
            "activation_rate": 0.0,
            "payment_risk_tenants": 0,
            "last_30d_value_events": 0,
        }
    avg = sum(s.score for s in snapshots) / total
    activated = len([s for s in snapshots if s.activation_status == "activated"])
    healthy = len([s for s in snapshots if s.band == "healthy"])
    attention = len([s for s in snapshots if s.band == "attention"])
    risk = len([s for s in snapshots if s.band == "risk"])
    critical = len([s for s in snapshots if s.band == "critical"])
    payment_risk_tenants = len([s for s in snapshots if (s.metrics_json or {}).get("payment_risk")])
    onboarding_completion_rate = round(sum(1 for s in snapshots if s.onboarding_score >= 25) / total * 100, 2)
    activation_rate = round(activated / total * 100, 2)
    last_30d_value_events = _count(db.query(func.count(AnalyticsEvent.id)).filter(AnalyticsEvent.occurred_at >= _recent_window(), AnalyticsEvent.event_name.in_(VALUE_EVENTS)))
    return {
        "total_tenants": total,
        "activated_tenants": activated,
        "healthy_tenants": healthy,
        "attention_tenants": attention,
        "risk_tenants": risk,
        "critical_tenants": critical,
        "average_health_score": round(avg, 2),
        "onboarding_completion_rate": onboarding_completion_rate,
        "activation_rate": activation_rate,
        "payment_risk_tenants": payment_risk_tenants,
        "last_30d_value_events": last_30d_value_events,
    }
