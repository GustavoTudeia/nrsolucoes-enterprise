from fastapi import APIRouter, Depends

from app.api.deps import require_legal_acceptance
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
    employee_portal,
    public,
    affiliates,
    audit,
    public_affiliates,
    platform_packs,
    esocial,
    platform_plans,
    invitations,
    auth_password,  # NOVO
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
router.include_router(campaigns.router, tags=["campaigns"], dependencies=console_deps)
router.include_router(risks.router, tags=["risks"], dependencies=console_deps)
router.include_router(
    action_plans.router, tags=["action-plans"], dependencies=console_deps
)
router.include_router(lms.router, tags=["lms"], dependencies=console_deps)
router.include_router(billing.router, tags=["billing"], dependencies=console_deps)
router.include_router(settings.router, tags=["settings"], dependencies=console_deps)
router.include_router(reports.router, tags=["reports"], dependencies=console_deps)
router.include_router(affiliates.router, tags=["affiliates"], dependencies=console_deps)
router.include_router(audit.router, tags=["audit"], dependencies=console_deps)
router.include_router(esocial.router, tags=["esocial"], dependencies=console_deps)
router.include_router(
    platform_packs.router, tags=["platform-packs"], dependencies=console_deps
)
router.include_router(
    platform_plans.router, tags=["platform-plans"], dependencies=console_deps
)

# Invitations (misto: alguns endpoints públicos para aceitar convite)
router.include_router(invitations.router, tags=["invitations"])

# Employee Portal / Público (sem aceite do console)
router.include_router(employee_portal.router, tags=["employee-portal"])
router.include_router(public.router, tags=["public"])
router.include_router(public_affiliates.router, tags=["public-affiliates"])

# Campaign Invitations (misto: admin endpoints com aceite, public endpoints sem)
router.include_router(campaign_invitations.router, tags=["campaign-invitations"])
