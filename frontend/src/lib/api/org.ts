import { apiFetch } from "@/lib/api/client";
import type { CNPJOut, OrgUnitOut } from "@/lib/api/types";

export async function listCnpjs(includeInactive: boolean = false) {
  const qs = includeInactive ? "?include_inactive=true" : "";
  return apiFetch<CNPJOut[]>("console", `/org/cnpjs${qs}`);
}

export async function createCnpj(payload: { legal_name: string; trade_name?: string; cnpj_number: string }) {
  return apiFetch<CNPJOut>("console", "/org/cnpjs", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateCnpj(
  cnpjId: string,
  payload: { legal_name?: string; trade_name?: string | null; cnpj_number?: string; is_active?: boolean }
) {
  return apiFetch<CNPJOut>("console", `/org/cnpjs/${encodeURIComponent(cnpjId)}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

export async function listUnits(cnpjId?: string, includeInactive: boolean = false) {
  const params = new URLSearchParams();
  if (cnpjId) params.set("cnpj_id", cnpjId);
  if (includeInactive) params.set("include_inactive", "true");
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<OrgUnitOut[]>("console", `/org/units${qs}`);
}

// Backward-compatible alias (algumas telas antigas usam este nome).
export async function listOrgUnits(cnpjId: string, includeInactive: boolean = false) {
  return listUnits(cnpjId, includeInactive);
}

export async function createUnit(payload: { cnpj_id: string; name: string; unit_type: string; parent_unit_id?: string | null }) {
  return apiFetch<OrgUnitOut>("console", "/org/units", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateUnit(
  unitId: string,
  payload: { name?: string; unit_type?: string; parent_unit_id?: string | null; is_active?: boolean }
) {
  return apiFetch<OrgUnitOut>("console", `/org/units/${encodeURIComponent(unitId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
