from app.models.types import GUID
from app.models.tenant import Tenant, TenantSettings, TenantSSOConfig
from app.models.billing import Plan, TenantSubscription, BillingProfile, BillingInvoice, PlatformBillingConfig, TenantOnboarding
from app.models.user import User, Role, UserRoleScope
from app.models.org import CNPJ, OrgUnit
from app.models.employee import Employee
from app.models.questionnaire import QuestionnaireTemplate, QuestionnaireVersion
from app.models.campaign import Campaign, SurveyResponse
from app.models.campaign_invitation import CampaignInvitation, CampaignInvitationBatch
from app.models.risk import RiskCriterionVersion, RiskAssessment
from app.models.action_plan import ActionPlan, ActionItem, ActionEvidence, ActionItemComment, ActionItemHistory
from app.models.lms import ContentItem, LearningPath, LearningPathItem, ContentAssignment, ContentCompletion, ContentProgress
from app.models.training import ActionItemEnrollment, TrainingCertificate
from app.models.template_pack import TemplatePack, TemplatePackItem
from app.models.esocial import ESocialS2240Profile, ESocialS2210Accident, ESocialS2220Exam
from app.models.audit_event import AuditEvent

from app.models.employee_auth import EmployeeMagicLinkToken, EmployeeOtpToken

from app.models.affiliate import Affiliate, ReferralAttribution, CommissionLedger, Payout

from app.models.legal import LegalAcceptance, PasswordResetToken

from app.models.sso import SSOLoginAttempt

# Novos modelos de autenticação e convites
from app.models.user_invitation import UserInvitation
from app.models.auth_token import AuthToken
from app.models.auth_audit_log import AuthAuditLog

from app.models.inventory import HazardCatalogItem, RiskInventoryItem

from app.models.pgr_governance import PGRDocumentApproval, ErgonomicAssessment

from app.models.analytics import AnalyticsEvent, TenantHealthSnapshot, TenantNudge

from app.models.refresh_session import RefreshSession
