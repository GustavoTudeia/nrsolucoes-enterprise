from fastapi import APIRouter, Depends

from app.api.deps import require_legal_acceptance
from app.core.config import settings as app_settings
from app.api.v1 import (
    health,
    auth,
    sso_auth,
    legal,
    tenants,
    org,
    users,
    employees,
    questionnaires,
    campaigns,
    campaign_invitations,
    risks,
    action_plans,
    lms,
    billing,
    settings,
    reports,
    inventory,
    employee_portal,
    employee_portal_trainings,
    employee_auth,
    public,
    affiliates,
    audit,
    public_affiliates,
    platform_packs,
    esocial,
    platform_plans,
    platform_subscriptions,
    platform_finance,
    invitations,
    auth_password,
    trainings,
    pgr_governance,
    analytics,
    test_support,
)

router = APIRouter(prefix="/api/v1")

# Base (sem gate)
router.include_router(health.router, tags=["health"])
router.include_router(auth.router, tags=["auth"])
router.include_router(
    auth_password.router, tags=["auth"]
)  # NOVO - recuperação de senha
router.include_router(sso_auth.router, tags=["sso"])
router.include_router(legal.router, tags=["legal"])

# Console (exige aceite)
console_deps = [Depends(require_legal_acceptance)]
router.include_router(tenants.router, tags=["tenants"], dependencies=console_deps)
router.include_router(org.router, tags=["org"], dependencies=console_deps)
router.include_router(users.router, tags=["users"], dependencies=console_deps)
router.include_router(employees.router, tags=["employees"], dependencies=console_deps)
router.include_router(
    questionnaires.router, tags=["questionnaires"], dependencies=console_deps
)
router.include_router(campaigns.router, tags=["campaigns"])
router.include_router(risks.router, tags=["risks"], dependencies=console_deps)
router.include_router(
    action_plans.router, tags=["action-plans"], dependencies=console_deps
)
router.include_router(trainings.router, tags=["trainings"], dependencies=console_deps)
router.include_router(lms.router, tags=["lms"], dependencies=console_deps)
router.include_router(billing.router, tags=["billing"], dependencies=console_deps)
router.include_router(billing.public_router, tags=["billing"])  # plans + webhook (sem auth)
router.include_router(settings.router, tags=["settings"], dependencies=console_deps)
router.include_router(reports.router, tags=["reports"], dependencies=console_deps)
router.include_router(analytics.router, tags=["analytics"], dependencies=console_deps)
router.include_router(pgr_governance.router, tags=["pgr-governance"], dependencies=console_deps)
router.include_router(inventory.router, tags=["inventory"], dependencies=console_deps)
router.include_router(affiliates.router, tags=["affiliates"], dependencies=console_deps)
router.include_router(audit.router, tags=["audit"], dependencies=console_deps)
router.include_router(esocial.router, tags=["esocial"], dependencies=console_deps)
router.include_router(
    platform_packs.router, tags=["platform-packs"], dependencies=console_deps
)
router.include_router(
    platform_plans.router, tags=["platform-plans"], dependencies=console_deps
)
router.include_router(
    platform_subscriptions.router, tags=["platform-subscriptions"], dependencies=console_deps
)
router.include_router(
    platform_finance.router, tags=["platform-finance"], dependencies=console_deps
)
router.include_router(analytics.platform_router, tags=["platform-analytics"], dependencies=console_deps)

# Invitations (misto: alguns endpoints públicos para aceitar convite)
router.include_router(invitations.router, tags=["invitations"])

# Employee Portal / Público (sem aceite do console)
router.include_router(employee_portal.router, tags=["employee-portal"])
router.include_router(
    employee_portal_trainings.router, prefix="/employee", tags=["employee-portal"]
)
router.include_router(employee_auth.router, tags=["employee-auth"])
router.include_router(public.router, tags=["public"])
router.include_router(analytics.public_router, tags=["analytics"])
router.include_router(public_affiliates.router, tags=["public-affiliates"])

# Campaign Invitations (misto: admin endpoints com aceite, public endpoints sem)
router.include_router(campaign_invitations.router, tags=["campaign-invitations"])


if app_settings.ENABLE_E2E_TEST_SUPPORT or app_settings.ENV == "test":
    router.include_router(test_support.router, tags=["test-support"])
