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
  is_platform_admin?: boolean;
  roles?: string[];
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
}

export interface SubscriptionOut {
  status: string;
  plan_id?: string | null;
  provider?: string | null;
  current_period_end?: string | null;
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
}


export interface CNPJOut {
  id: string;
  legal_name: string;
  trade_name?: string | null;
  cnpj_number: string;
  is_active: boolean;
}

export interface OrgUnitOut {
  id: string;
  cnpj_id: string;
  name: string;
  unit_type: string;
  parent_unit_id?: string | null;
  is_active: boolean;
}

export interface EmployeeOut {
  id: string;
  identifier: string;
  full_name: string;
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
  tenant_id: string;
  campaign_id: string;
  cnpj_id: string;
  org_unit_id?: string | null;
  criterion_version_id: string;
  score: number;
  level: string;
  dimension_scores: Record<string, any>;
  assessed_at: string;
  created_at: string;
}

export interface ActionEvidenceOut {
  id: string;
  action_item_id: string;
  evidence_type: string;
  reference: string;
  note?: string | null;
  created_at: string;
}

export interface ActionItemOut {
  id: string;
  action_plan_id: string;
  item_type: "educational" | "organizational" | "administrative";
  title: string;
  description?: string | null;
  responsible?: string | null;
  due_date?: string | null;
  status: string;
  education_ref_type?: string | null;
  education_ref_id?: string | null;
  created_at: string;
  evidences?: ActionEvidenceOut[] | null;
}

export interface ActionPlanOut {
  id: string;
  risk_assessment_id: string;
  status: string;
  version: number;
  created_at: string;
  items?: ActionItemOut[] | null;
}

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
