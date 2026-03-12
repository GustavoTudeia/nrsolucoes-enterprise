import { apiFetch } from "@/lib/api/client";
import type { EmployeeOut } from "@/lib/api/types";

export async function listEmployees(includeInactive: boolean = false) {
  const qs = includeInactive ? "?include_inactive=true" : "";
  return apiFetch<EmployeeOut[]>("console", `/employees${qs}`);
}

export async function createEmployee(payload: {
  identifier: string; full_name: string;
  cpf?: string | null; email?: string | null; phone?: string | null;
  job_title?: string | null; admission_date?: string | null;
  cnpj_id?: string | null; org_unit_id?: string | null;
}) {
  return apiFetch<EmployeeOut>("console", "/employees", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateEmployee(
  employeeId: string,
  payload: {
    identifier?: string; full_name?: string;
    cpf?: string | null; email?: string | null; phone?: string | null;
    job_title?: string | null; admission_date?: string | null;
    cnpj_id?: string | null; org_unit_id?: string | null; is_active?: boolean;
  }
) {
  return apiFetch<EmployeeOut>("console", `/employees/${encodeURIComponent(employeeId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function deleteEmployee(employeeId: string) {
  return apiFetch<{ status: string }>("console", `/employees/${encodeURIComponent(employeeId)}`, {
    method: "DELETE",
  });
}

export async function inviteEmployee(employeeId: string) {
  return apiFetch<{ status: string; employee_id: string; magic_link_api_url: string; token_dev?: string }>(
    "console",
    `/employees/${encodeURIComponent(employeeId)}/invite`,
    { method: "POST" }
  );
}

export interface EmployeeImportRow {
  identifier: string;
  full_name?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  job_title?: string;
  admission_date?: string;
  org_unit_id?: string;
}

export interface EmployeeImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; identifier?: string; error: string }>;
}

export async function importEmployees(rows: EmployeeImportRow[], skipDuplicates: boolean = true) {
  return apiFetch<EmployeeImportResult>("console", "/employees/import", {
    method: "POST",
    body: JSON.stringify({ rows, skip_duplicates: skipDuplicates }),
  });
}
