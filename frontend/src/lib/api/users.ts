import { apiFetch } from "@/lib/api/client";
import type { UserOut, RoleOut, RoleAssignmentOut } from "@/lib/api/types";

interface PagedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export async function listUsers(params?: { q?: string; role?: string; status?: string; limit?: number; offset?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.q) searchParams.set("q", params.q);
  if (params?.role) searchParams.set("role", params.role);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  
  const query = searchParams.toString();
  const url = query ? `/users?${query}` : "/users";
  
  return apiFetch<PagedResponse<UserOut>>("console", url);
}

// Função de conveniência para obter apenas o array (compatibilidade)
export async function listUsersArray() {
  const res = await listUsers({ limit: 100 });
  return res.items;
}

export async function listRoles() {
  return apiFetch<RoleOut[]>("console", "/users/roles");
}

export async function listUserRoles(user_id: string) {
  return apiFetch<RoleAssignmentOut[]>("console", `/users/${user_id}/roles`);
}

export async function assignRole(user_id: string, payload: { role_key: string; tenant_id?: string; cnpj_id?: string; org_unit_id?: string }) {
  return apiFetch<{ status: string; id: string }>("console", `/users/${user_id}/roles`, { method: "POST", body: JSON.stringify(payload) });
}

export async function revokeRole(user_id: string, assignment_id: string) {
  return apiFetch<{ status: string }>("console", `/users/${user_id}/roles/${assignment_id}`, { method: "DELETE" });
}
