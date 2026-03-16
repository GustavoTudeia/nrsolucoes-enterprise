import { apiFetch } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";

export type TenantOut = {
  id: string;
  name: string;
  slug?: string | null;
  is_active: boolean;
  plan_key?: string | null;
  plan_name?: string | null;
  subscription_status?: string | null;
};

export type TenantCreate = {
  name: string;
  slug?: string | null;
};

export type PlanAdminOut = {
  id: string;
  key: string;
  name: string;
  features: Record<string, any>;
  limits: Record<string, any>;
  price_monthly?: number | null;
  price_annual?: number | null;
  is_custom_price?: boolean;
  stripe_price_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_annual?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export async function listTenants(q?: string, limit: number = 50, offset: number = 0) {
  const qp = new URLSearchParams();
  if (q) qp.set("q", q);
  qp.set("limit", String(limit));
  qp.set("offset", String(offset));
  return apiFetch<Page<TenantOut>>("console", `/tenants?${qp.toString()}`);
}

export async function createTenant(payload: TenantCreate) {
  return apiFetch<TenantOut>("console", "/tenants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listPlatformPlans() {
  return apiFetch<PlanAdminOut[]>("console", "/platform/plans");
}

export async function createPlan(payload: {
  key: string;
  name: string;
  features?: Record<string, any>;
  limits?: Record<string, any>;
  price_monthly?: number | null;
  price_annual?: number | null;
  is_custom_price?: boolean;
  stripe_price_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_annual?: string | null;
  is_active?: boolean;
}) {
  return apiFetch<PlanAdminOut>("console", "/platform/plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updatePlan(planId: string, payload: {
  name?: string;
  features?: Record<string, any>;
  limits?: Record<string, any>;
  price_monthly?: number | null;
  price_annual?: number | null;
  is_custom_price?: boolean;
  stripe_price_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_annual?: string | null;
  is_active?: boolean;
}) {
  return apiFetch<PlanAdminOut>("console", `/platform/plans/${planId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function setTenantPlan(tenantId: string, planKey: string, status: string = "active") {
  return apiFetch<{ ok: boolean; tenant_id: string; plan_key: string; status: string }>(
    "console",
    `/platform/tenants/${tenantId}/plan`,
    {
      method: "PUT",
      body: JSON.stringify({ plan_key: planKey, status }),
    }
  );
}
