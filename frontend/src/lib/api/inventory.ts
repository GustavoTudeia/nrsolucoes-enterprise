import { apiFetch } from "@/lib/api/client";

export type HazardCatalogItemOut = {
  id: string;
  code: string;
  hazard_group: string;
  name: string;
  description?: string | null;
  legal_basis?: string | null;
  control_suggestions: string[];
  default_evidence_requirements: string[];
};

export type RiskInventoryItemOut = {
  id: string;
  cnpj_id: string;
  org_unit_id?: string | null;
  process_name: string;
  activity_name: string;
  position_name?: string | null;
  hazard_group: string;
  hazard_name: string;
  source_or_circumstance?: string | null;
  possible_damage?: string | null;
  exposed_workers: number;
  existing_controls: string[];
  proposed_controls: string[];
  evidence_requirements: string[];
  severity: number;
  probability: number;
  risk_score: number;
  risk_level: string;
  status: string;
  approval_notes?: string | null;
  created_at: string;
  updated_at: string;
};

export async function listHazardLibrary(params?: { hazard_group?: string; q?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.hazard_group) qs.set("hazard_group", params.hazard_group);
  if (params?.q) qs.set("q", params.q);
  qs.set("limit", String(params?.limit ?? 100));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<{ items: HazardCatalogItemOut[]; total: number }>("console", `/inventory/library?${qs.toString()}`);
}

export async function listInventoryItems(params?: { cnpj_id?: string; org_unit_id?: string; hazard_group?: string; status?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  if (params?.hazard_group) qs.set("hazard_group", params.hazard_group);
  if (params?.status) qs.set("status", params.status);
  qs.set("limit", String(params?.limit ?? 100));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<{ items: RiskInventoryItemOut[]; total: number }>("console", `/inventory/items?${qs.toString()}`);
}

export async function createInventoryItem(payload: Record<string, any>) {
  return apiFetch<RiskInventoryItemOut>("console", "/inventory/items", { method: "POST", body: JSON.stringify(payload) });
}

export async function approveInventoryItem(itemId: string, approval_notes?: string) {
  return apiFetch<RiskInventoryItemOut>("console", `/inventory/items/${itemId}/approve`, { method: "POST", body: JSON.stringify({ approval_notes }) });
}
