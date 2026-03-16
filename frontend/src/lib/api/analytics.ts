import { apiFetch } from "@/lib/api/client";
import type {
  PlatformAnalyticsOverviewOut,
  PlatformTenantHealthItemOut,
  TenantHealthOut,
  TenantNudgeOut,
  WorkflowRunOut,
} from "@/lib/api/types";

export async function getTenantHealth() {
  return apiFetch<TenantHealthOut>("console", "/analytics/health");
}

export async function listTenantNudges(status: string = "pending") {
  const qs = new URLSearchParams({ status });
  return apiFetch<TenantNudgeOut[]>("console", `/analytics/nudges?${qs.toString()}`);
}

export async function refreshTenantHealth() {
  return apiFetch<TenantHealthOut>("console", "/analytics/refresh", { method: "POST" });
}

export async function getPlatformAnalyticsOverview() {
  return apiFetch<PlatformAnalyticsOverviewOut>("console", "/platform/analytics/overview");
}

export async function listPlatformTenantHealth(params?: { band?: string }) {
  const qs = new URLSearchParams();
  if (params?.band) qs.set("band", params.band);
  return apiFetch<PlatformTenantHealthItemOut[]>("console", `/platform/analytics/tenants?${qs.toString()}`);
}

export async function runRetentionWorkflows(params?: { tenantId?: string; sendEmails?: boolean }) {
  const qs = new URLSearchParams();
  if (params?.tenantId) qs.set("tenant_id", params.tenantId);
  if (params?.sendEmails != null) qs.set("send_emails", String(params.sendEmails));
  return apiFetch<WorkflowRunOut>("console", `/platform/analytics/workflows/run?${qs.toString()}`, { method: "POST" });
}
