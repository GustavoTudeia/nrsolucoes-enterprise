import { apiFetch } from "@/lib/api/client";
import type { CampaignOut, CampaignDetailOut, Page, CampaignAggregateOut, CampaignAggregateByOrgUnitOut } from "@/lib/api/types";

export async function createCampaign(payload: { name: string; cnpj_id: string; org_unit_id?: string | null; questionnaire_version_id: string }) {
  return apiFetch<CampaignOut>("console", "/campaigns", { method: "POST", body: JSON.stringify(payload) });
}

export async function openCampaign(campaignId: string) {
  return apiFetch<CampaignOut>("console", `/campaigns/${encodeURIComponent(campaignId)}/open`, { method: "POST" });
}

export async function closeCampaign(campaignId: string) {
  return apiFetch<CampaignOut>("console", `/campaigns/${encodeURIComponent(campaignId)}/close`, { method: "POST" });
}

export async function aggregateCampaign(campaignId: string) {
  return apiFetch<CampaignAggregateOut>("console", `/campaigns/${encodeURIComponent(campaignId)}/aggregate`);
}

export async function aggregateByOrgUnit(campaignId: string) {
  return apiFetch<CampaignAggregateByOrgUnitOut>("console", `/campaigns/${encodeURIComponent(campaignId)}/aggregate/by-org-unit`);
}


export async function listCampaigns(params?: { status?: string; cnpj_id?: string; org_unit_id?: string; questionnaire_version_id?: string; q?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  if (params?.questionnaire_version_id) qs.set("questionnaire_version_id", params.questionnaire_version_id);
  if (params?.q) qs.set("q", params.q);
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<Page<CampaignDetailOut>>("console", `/campaigns?${qs.toString()}`);
}

export async function getCampaign(campaignId: string) {
  return apiFetch<CampaignDetailOut>("console", `/campaigns/${encodeURIComponent(campaignId)}`);
}

export async function getCampaignStats(campaignId: string) {
  return apiFetch<{ campaign_id: string; responses: number; min_anon_threshold: number; aggregation_allowed: boolean }>(
    "console",
    `/campaigns/${encodeURIComponent(campaignId)}/stats`
  );
}
