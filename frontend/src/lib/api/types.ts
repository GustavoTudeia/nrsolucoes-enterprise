export type ApiScope = "public" | "console" | "employee";

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ApiErrorShape {
  detail?: string;
}

export interface AuthLoginResponse {
  access_token: string;
  token_type: string;
}

export interface MeResponse {
  id: string;
  email: string;
  full_name?: string | null;
  tenant_id?: string | null;
  tenant?: { id: string; name: string; slug?: string } | null;
  is_platform_admin?: boolean;
  roles?: string[];
  phone?: string | null;
  cpf?: string | null;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface UserOut {
  id: string;
  email: string;
  full_name?: string | null;
  tenant_id?: string | null;
  is_active: boolean;
  is_platform_admin: boolean;
}

export interface PlanOut {
  id: string;
  key: string;
  name: string;
  features: Record<string, any>;
  limits: Record<string, any>;
  price_monthly?: number | null;
  price_annual?: number | null;
  is_custom_price?: boolean;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_annual?: string | null;
}

export interface SubscriptionOut {
  status: string;
  plan_id?: string | null;
  provider?: string | null;
  current_period_end?: string | null;
  billing_cycle?: string | null;
  entitlements_snapshot?: Record<string, any>;
}

export interface AffiliateResolveOut {
  affiliate_code: string;
  discount_percent: number;
}

export interface PublicTenantResolveOut {
  tenant_id: string;
  name: string;
  slug: string;
}

export interface CheckoutSessionOut {
  checkout_url: string;
}


export interface PortalSessionOut {
  url: string;
}

export interface InvoiceOut {
  id: string;
  number?: string | null;
  status?: string | null;
  currency?: string | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  created?: number | null; // unix epoch seconds
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  fiscal_status?: string | null;
  external_invoice_number?: string | null;
  fiscal_pdf_url?: string | null;
  emailed_at?: string | null;
}


export interface CNPJOut {
  id: string;
  legal_name: string;
  trade_name?: string | null;
  cnpj_number: string;
  is_active: boolean;
  unit_count: number;
  employee_count: number;
}

export interface OrgUnitOut {
  id: string;
  cnpj_id: string;
  name: string;
  unit_type: string;
  parent_unit_id?: string | null;
  is_active: boolean;
  employee_count: number;
}

export interface EmployeeOut {
  id: string;
  identifier: string;
  full_name: string;
  cpf?: string | null;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  admission_date?: string | null;
  cnpj_id?: string | null;
  org_unit_id?: string | null;
  is_active?: boolean;
}

export interface ContentOut {
  id: string;
  title: string;
  description?: string | null;
  content_type: string;
  url?: string | null;
  storage_key?: string | null;
  duration_minutes?: number | null;
  is_platform_managed?: boolean;
  is_active?: boolean;
}

export interface ContentUploadOut {
  content_id: string;
  upload_url: string;
  method: "PUT";
  expires_in_seconds: number;
}

export interface ContentAccessOut {
  content_id: string;
  access_url: string;
  expires_in_seconds: number;
}

export interface EmployeeAssignmentOut {
  id: string;
  content_item_id?: string | null;
  learning_path_id?: string | null;
  status: string;
  due_at?: string | null;

  progress_seconds?: number | null;
  duration_seconds?: number | null;
}

export interface EmployeeContentOut {
  id: string;
  title: string;
  description?: string | null;
  url: string;
  content_type: string;
  duration_minutes?: number | null;
}

export interface ProgressOut {
  assignment_id: string;
  employee_id: string;
  position_seconds: number;
  duration_seconds?: number | null;
  last_event_at: string;
}

export interface CampaignOut {
  id: string;
  name: string;
  cnpj_id: string;
  org_unit_id?: string | null;
  questionnaire_version_id: string;
  status: string;
}

export interface CampaignDetailOut extends CampaignOut {
  tenant_id: string;
  org_unit_name?: string | null;
  response_count: number;
  created_at: string;
  opened_at?: string | null;
  closed_at?: string | null;
}

export interface CampaignAggregateOut {
  campaign_id: string;
  responses: number;
  dimension_scores: Record<string, number>;
}

export interface CampaignAggregateByOrgUnitOut {
  campaign_id: string;
  min_anon_threshold: number;
  groups: Array<{ org_unit_id: string | null; n: number; dimension_scores: Record<string, number> }>;
  blocked_groups: Array<{ org_unit_id: string | null; n: number }>;
}

export interface CriterionOut {
  id: string;
  tenant_id?: string | null;
  name: string;
  status: string;
  version: number;
  content: any;
  published_at?: string | null;
  created_at: string;
}

export interface RiskAssessmentOut {
  id: string;
  campaign_id: string;
  campaign_name?: string;      // NOVO
  cnpj_id: string;
  org_unit_id?: string;
  org_unit_name?: string;      // NOVO
  criterion_version_id: string;
  criterion_name?: string;     // NOVO
  score: number;
  level: string;
  dimension_scores: Record<string, number>;
  assessed_at: string;
  created_at: string;
}

// Action Plan types: canonical definitions in actionPlans.ts
export type { ActionEvidenceOut, ActionItemOut, ActionPlanOut } from "./actionPlans";

export interface LMSAssignmentOut {
  id: string;
  content_item_id?: string | null;
  learning_path_id?: string | null;
  employee_id?: string | null;
  org_unit_id?: string | null;
  due_at?: string | null;
  status: string;
  created_at: string;
  progress_seconds?: number | null;
  duration_seconds?: number | null;
  completed_at?: string | null;
}

export interface TenantSettingsOut {
  min_anon_threshold: number;
  brand_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  support_email?: string | null;
  custom_domain?: string | null;
  login_background_url?: string | null;
}

export interface SSOConfigOut {
  enabled: boolean;
  issuer_url?: string | null;
  client_id?: string | null;
  allowed_domains: string[];
  has_client_secret: boolean;
}

export interface RoleOut {
  key: string;
  name: string;
  description?: string | null;
}

export interface RoleAssignmentOut {
  id: string;
  role_key: string;
  tenant_id?: string | null;
  cnpj_id?: string | null;
  org_unit_id?: string | null;
}

export interface LegalRequiredOut {
  terms_version: string;
  privacy_version: string;
  terms_url: string;
  privacy_url: string;
}

export interface LegalStatusOut {
  required: LegalRequiredOut;
  accepted_terms_version?: string | null;
  accepted_privacy_version?: string | null;
  accepted_at?: string | null;
  is_missing: boolean;
}

export interface AffiliateOut {
  id: string;
  code: string;
  name: string;
  email?: string | null;
  status: string;
  discount_percent: number;
  commission_percent: number;
}

export interface LedgerOut {
  id: string;
  affiliate_id: string;
  tenant_id: string;
  provider_invoice_id: string;
  net_amount: number;
  commission_amount: number;
  status: string;
}

export interface PayoutOut {
  id: string;
  affiliate_id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  reference?: string | null;
}

// =========================
// eSocial SST (assistido)
// =========================
export interface ESocialExportOut {
  event: string;
  generated_at: string;
  data: any;
}

export interface S2240ProfileOut {
  id: string;
  tenant_id: string;
  cnpj_id: string;
  org_unit_id?: string | null;
  role_name: string;
  environment_code?: string | null;
  activity_description?: string | null;
  factors: any[];
  controls: any;
  valid_from?: string | null;
  valid_to?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface S2210AccidentOut {
  id: string;
  tenant_id: string;
  employee_id: string;
  occurred_at: string;
  accident_type?: string | null;
  description?: string | null;
  location?: string | null;
  cat_number?: string | null;
  payload: any;
  created_at: string;
  updated_at: string;
}

export interface S2220ExamOut {
  id: string;
  tenant_id: string;
  employee_id: string;
  exam_date: string;
  exam_type?: string | null;
  result?: string | null;
  payload: any;
  created_at: string;
  updated_at: string;
}

// ── Platform Admin: Subscriptions ────────────────────────────────────────────

export interface SubscriptionAdminOut {
  id: string;
  tenant_id: string;
  tenant_name: string;
  plan_key?: string | null;
  plan_name?: string | null;
  status: string;
  period_start?: string | null;
  period_end?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionStatsOut {
  total: number;
  by_status: Record<string, number>;
  active_count: number;
}

// Re-export training types for backwards compatibility
export type { EnrollmentOut, EnrollmentStats } from "./trainings";


export interface BillingProfileOut {
  id: string;
  tenant_id: string;
  legal_name: string;
  trade_name?: string | null;
  cnpj_number: string;
  state_registration?: string | null;
  municipal_registration?: string | null;
  tax_regime?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  finance_email?: string | null;
  contact_phone?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_district?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country_code: string;
  notes?: string | null;
  is_complete: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface BillingProfileStatusOut {
  is_complete: boolean;
  missing_fields: string[];
}

export interface OnboardingStepOut {
  key: string;
  title: string;
  description: string;
  status: string;
  href: string;
}

export interface OnboardingOverviewOut {
  status: string;
  progress_percent: number;
  current_step?: string | null;
  steps: OnboardingStepOut[];
  metrics: Record<string, number>;
}

export interface PlatformBillingConfigOut {
  id: string;
  key: string;
  is_active: boolean;
  provider_type: "manual" | "custom_webhook" | "nfse_nacional";
  provider_environment: "sandbox" | "production";
  issuer_legal_name?: string | null;
  issuer_document?: string | null;
  issuer_municipal_registration?: string | null;
  issuer_email?: string | null;
  service_code?: string | null;
  service_description?: string | null;
  api_base_url?: string | null;
  api_token?: string | null;
  webhook_url?: string | null;
  webhook_secret?: string | null;
  auto_issue_on_payment: boolean;
  auto_email_invoice: boolean;
  send_boleto_pdf: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceOverviewOut {
  total_invoices: number;
  paid_invoices: number;
  ready_to_issue: number;
  overdue_invoices: number;
  revenue_paid_cents: number;
  revenue_open_cents: number;
  by_payment_status: Record<string, number>;
  by_fiscal_status: Record<string, number>;
}

export interface BillingInvoiceAdminOut {
  id: string;
  tenant_id: string;
  tenant_name: string;
  customer_name?: string | null;
  customer_document?: string | null;
  payment_status: string;
  fiscal_status: string;
  amount_due?: number | null;
  amount_paid?: number | null;
  currency: string;
  due_at?: string | null;
  paid_at?: string | null;
  external_invoice_number?: string | null;
  hosted_invoice_url?: string | null;
  invoice_pdf_url?: string | null;
  fiscal_pdf_url?: string | null;
  emailed_at?: string | null;
  created_at: string;
  updated_at: string;
}


export interface TenantRecommendationOut {
  key: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low" | string;
  href?: string | null;
}

export interface TenantHealthOut {
  tenant_id: string;
  score: number;
  band: string;
  activation_status: string;
  onboarding_score: number;
  activation_score: number;
  depth_score: number;
  routine_score: number;
  billing_score: number;
  last_value_event_at?: string | null;
  last_active_at?: string | null;
  recomputed_at: string;
  metrics: Record<string, any>;
  risk_flags: string[];
  recommendations: TenantRecommendationOut[];
}

export interface TenantNudgeOut {
  id: string;
  nudge_key: string;
  channel: string;
  audience_role?: string | null;
  title: string;
  body: string;
  status: string;
  send_email: boolean;
  due_at?: string | null;
  sent_at?: string | null;
  context: Record<string, any>;
}

export interface PlatformAnalyticsOverviewOut {
  total_tenants: number;
  healthy_tenants: number;
  attention_tenants: number;
  risk_tenants: number;
  critical_tenants: number;
  average_score: number;
  active_last_30d: number;
  activated_tenants: number;
  churn_risk_tenants: number;
}

export interface PlatformTenantHealthItemOut {
  tenant_id: string;
  tenant_name: string;
  tenant_slug?: string | null;
  plan_key?: string | null;
  billing_status?: string | null;
  score: number;
  band: string;
  activation_status: string;
  last_active_at?: string | null;
  last_value_event_at?: string | null;
  metrics: Record<string, any>;
  risk_flags: string[];
}

export interface WorkflowRunOut {
  ok: boolean;
  processed_tenants: number;
  nudges_generated: number;
  nudges_sent: number;
}
