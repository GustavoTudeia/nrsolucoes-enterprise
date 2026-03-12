import { apiFetch } from "@/lib/api/client";

export interface TenantOverviewOut {
  tenant_id: string;
  generated_at: string;
  lgpd: { min_anon_threshold: number };
  counts: {
    cnpjs: number;
    org_units: number;
    employees: number;
    campaigns: number;
    responses: number;
    risk_assessments: number;
    action_items: number;
  };
  campaigns: { draft: number; open: number; closed: number };
  risks: { low: number; medium: number; high: number };
  actions: { planned: number; in_progress: number; done: number };
  audit: { last_event_at: string | null };
  readiness: { org_structure: boolean; diagnostic: boolean; risk: boolean; action_plan: boolean; overall: boolean };
}

export async function getTenantOverview() {
  return apiFetch<TenantOverviewOut>("console", "/reports/overview");
}

export interface PgrDossierOut {
  tenant_id: string;
  generated_at: string;
  lgpd: { min_anon_threshold: number };
  structure: {
    cnpjs: Array<{ id: string; legal_name: string; trade_name?: string | null; cnpj_number: string; is_active: boolean }>;
    org_units: Array<{ id: string; cnpj_id: string; name: string; unit_type: string; parent_unit_id?: string | null; is_active: boolean }>;
  };
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    cnpj_id: string;
    cnpj_legal_name?: string | null;
    org_unit_id?: string | null;
    org_unit_name?: string | null;
    questionnaire_version_id: string;
    created_at: string;
    opened_at?: string | null;
    closed_at?: string | null;
    responses: number;
    aggregation_allowed: boolean;
  }>;
  risks: Array<{
    id: string;
    campaign_id: string;
    cnpj_id: string;
    org_unit_id?: string | null;
    score: number;
    level: string;
    dimension_scores: Record<string, any>;
    assessed_at: string;
  }>;
  action_plans: Array<{
    id: string;
    risk_assessment_id: string;
    status: string;
    version: number;
    created_at: string;
    items: Array<{
      id: string;
      item_type: string;
      title: string;
      description?: string | null;
      responsible?: string | null;
      due_date?: string | null;
      status: string;
      created_at: string;
      evidences: Array<{ id: string; evidence_type: string; reference: string; note?: string | null; created_at: string }>;
    }>;
  }>;
  audit: Array<{ id: string; created_at: string; action: string; entity_type: string; entity_id?: string | null; actor_user_id?: string | null; ip?: string | null; request_id?: string | null }>;
}

export async function getPgrDossier(params?: { cnpj_id?: string; campaign_id?: string; limit_audit?: number }) {
  const qs = new URLSearchParams();
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.campaign_id) qs.set("campaign_id", params.campaign_id);
  if (params?.limit_audit !== undefined) qs.set("limit_audit", String(params.limit_audit));
  const tail = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<PgrDossierOut>("console", `/reports/pgr-dossier${tail}`);
}

// ============ Readiness ============

export interface ReadinessStep {
  key: string;
  label: string;
  done: boolean;
  description: string;
}

export interface ReadinessOut {
  steps: ReadinessStep[];
  done: number;
  total: number;
  completion_percentage: number;
  overall_ready: boolean;
}

export async function getReadiness(): Promise<ReadinessOut> {
  return apiFetch("console", "/reports/readiness");
}

// ============ Training Summary ============

export interface TrainingSummaryItem {
  id: string;
  title: string;
  status: string;
  control_hierarchy?: string | null;
  training_type?: string | null;
  enrollment_total: number;
  enrollment_completed: number;
  enrollment_pending: number;
  enrollment_in_progress: number;
  completion_rate: number;
}

export interface TrainingSummaryOut {
  tenant_id: string;
  generated_at: string;
  summary: {
    total_educational_items: number;
    total_enrollments: number;
    completed: number;
    pending: number;
    in_progress: number;
    expired: number;
    completion_rate: number;
    certificates_issued: number;
  };
  items: TrainingSummaryItem[];
}

export async function getTrainingSummary(params?: {
  cnpj_id?: string;
  org_unit_id?: string;
}): Promise<TrainingSummaryOut> {
  const qs = new URLSearchParams();
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  const q = qs.toString();
  return apiFetch("console", `/reports/training-summary${q ? `?${q}` : ""}`);
}

// ============ PGR Dossier PDF Download ============

export async function downloadPgrDossierPdf(params?: {
  cnpj_id?: string;
  campaign_id?: string;
  limit_audit?: number;
}): Promise<Blob> {
  const qs = new URLSearchParams();
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.campaign_id) qs.set("campaign_id", params.campaign_id);
  if (params?.limit_audit) qs.set("limit_audit", String(params.limit_audit));
  const q = qs.toString();

  const res = await fetch(`/api/bff/console/reports/pgr-dossier/pdf${q ? `?${q}` : ""}`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Erro ao gerar PDF");
  return res.blob();
}
