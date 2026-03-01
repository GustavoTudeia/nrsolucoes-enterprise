import { apiFetch } from "@/lib/api/client";
import type { RiskAssessmentOut, CriterionOut, Page } from "@/lib/api/types";

export async function assessRisk(payload: { campaign_id: string; criterion_version_id: string; org_unit_id?: string | null }) {
  const qs = new URLSearchParams({ criterion_version_id: payload.criterion_version_id });
  if (payload.org_unit_id) qs.set("org_unit_id", payload.org_unit_id);
  return apiFetch<RiskAssessmentOut>("console", `/risks/assess/${encodeURIComponent(payload.campaign_id)}?${qs.toString()}`, { method: "POST" });
}

// Backward-compatible alias
export async function assessCampaign(campaign_id: string, criterion_version_id: string, org_unit_id?: string) {
  return assessRisk({ campaign_id, criterion_version_id, org_unit_id: org_unit_id || null });
}


export async function listCriteria(params?: { status?: string; q?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.q) qs.set("q", params.q);
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<Page<CriterionOut>>("console", `/risks/criteria?${qs.toString()}`);
}

export async function listAssessments(params?: { campaign_id?: string; cnpj_id?: string; org_unit_id?: string; level?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.campaign_id) qs.set("campaign_id", params.campaign_id);
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  if (params?.level) qs.set("level", params.level);
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<Page<RiskAssessmentOut>>("console", `/risks/assessments?${qs.toString()}`);
}

export async function getAssessment(id: string) {
  return apiFetch<RiskAssessmentOut>("console", `/risks/assessments/${encodeURIComponent(id)}`);
}
