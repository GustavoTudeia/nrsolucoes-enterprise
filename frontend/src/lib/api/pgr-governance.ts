import { apiFetch } from "@/lib/api/client";

export type PGRDocumentApprovalOut = {
  id: string;
  tenant_id: string;
  cnpj_id: string;
  org_unit_id?: string | null;
  document_scope: string;
  version_label: string;
  status: string;
  statement: string;
  notes?: string | null;
  approver_name: string;
  approver_role?: string | null;
  approver_email?: string | null;
  effective_from: string;
  review_due_at?: string | null;
  approved_at: string;
  inventory_item_count: number;
  snapshot_hash: string;
  snapshot_json: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export type ErgonomicAssessmentOut = {
  id: string;
  tenant_id: string;
  cnpj_id: string;
  org_unit_id?: string | null;
  assessment_type: "AEP" | "AET" | string;
  title: string;
  status: string;
  process_name?: string | null;
  activity_name?: string | null;
  position_name?: string | null;
  workstation_name?: string | null;
  demand_summary?: string | null;
  conditions_summary?: string | null;
  psychosocial_factors: string[];
  findings: string[];
  recommendations: string[];
  traceability: Record<string, any>;
  reviewed_at?: string | null;
  review_due_at?: string | null;
  approved_at?: string | null;
  approval_notes?: string | null;
  created_at: string;
  updated_at: string;
};

export async function listPgrApprovals(params?: { cnpj_id?: string; org_unit_id?: string; status?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  if (params?.status) qs.set("status", params.status);
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<{ items: PGRDocumentApprovalOut[]; total: number }>("console", `/pgr/approvals?${qs.toString()}`);
}

export async function createPgrApproval(payload: Record<string, any>) {
  return apiFetch<PGRDocumentApprovalOut>("console", "/pgr/approvals", { method: "POST", body: JSON.stringify(payload) });
}

export async function listErgonomics(params?: { cnpj_id?: string; org_unit_id?: string; assessment_type?: string; status?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  if (params?.assessment_type) qs.set("assessment_type", params.assessment_type);
  if (params?.status) qs.set("status", params.status);
  qs.set("limit", String(params?.limit ?? 100));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<{ items: ErgonomicAssessmentOut[]; total: number }>("console", `/pgr/ergonomics?${qs.toString()}`);
}

export async function createErgonomicAssessment(payload: Record<string, any>) {
  return apiFetch<ErgonomicAssessmentOut>("console", "/pgr/ergonomics", { method: "POST", body: JSON.stringify(payload) });
}

export async function approveErgonomicAssessment(assessmentId: string, approval_notes?: string) {
  return apiFetch<ErgonomicAssessmentOut>("console", `/pgr/ergonomics/${assessmentId}/approve`, { method: "POST", body: JSON.stringify({ approval_notes }) });
}
