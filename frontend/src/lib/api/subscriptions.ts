import { apiFetch } from "@/lib/api/client";
import type { Page, SubscriptionAdminOut, SubscriptionStatsOut } from "@/lib/api/types";

export async function listPlatformSubscriptions(params?: {
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const qp = new URLSearchParams();
  if (params?.status) qp.set("status", params.status);
  if (params?.q) qp.set("q", params.q);
  if (params?.limit) qp.set("limit", String(params.limit));
  if (params?.offset) qp.set("offset", String(params.offset));
  return apiFetch<Page<SubscriptionAdminOut>>("console", `/platform/subscriptions?${qp.toString()}`);
}

export async function changeSubscriptionStatus(tenantId: string, status: string) {
  return apiFetch<{ ok: boolean; tenant_id: string; status: string }>(
    "console",
    `/platform/subscriptions/${tenantId}/status`,
    {
      method: "PUT",
      body: JSON.stringify({ status }),
    }
  );
}

export async function getSubscriptionStats() {
  return apiFetch<SubscriptionStatsOut>("console", "/platform/subscriptions/stats");
}
