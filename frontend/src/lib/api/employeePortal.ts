import { apiFetch } from "@/lib/api/client";
import type { EmployeeAssignmentOut, EmployeeContentOut, ProgressOut } from "@/lib/api/types";

export async function employeeMe() {
  return apiFetch("employee", "/employee/me");
}

export async function listEmployeeAssignments() {
  return apiFetch<EmployeeAssignmentOut[]>("employee", "/employee/assignments");
}

export async function getEmployeeContent(content_id: string, assignment_id?: string) {
  const qs = assignment_id ? `?assignment_id=${encodeURIComponent(assignment_id)}` : "";
  return apiFetch<EmployeeContentOut>("employee", `/employee/contents/${content_id}${qs}`);
}

export async function completeAssignment(assignment_id: string) {
  return apiFetch<{ id: string }>("employee", `/employee/completions?assignment_id=${encodeURIComponent(assignment_id)}`, { method: "POST" });
}

export async function upsertProgress(payload: { assignment_id: string; position_seconds: number; duration_seconds?: number | null }) {
  return apiFetch<ProgressOut>("employee", "/employee/progress", { method: "POST", body: JSON.stringify(payload) });
}

export async function consumeMagicToken(token: string) {
  const res = await fetch(`/api/auth/employee/magic/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Link inválido ou expirado");
  return data;
}

export async function otpStart(payload: { tenant_id: string; identifier: string }) {
  const res = await fetch("/api/auth/employee/otp/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Erro ao enviar OTP");
  return data;
}

export async function otpVerify(payload: { tenant_id: string; identifier: string; code: string }) {
  const res = await fetch("/api/auth/employee/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Código inválido");
  return data;
}
