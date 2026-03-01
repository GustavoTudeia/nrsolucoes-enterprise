import { apiFetch } from "@/lib/api/client";
import type { PlanOut, SubscriptionOut, CheckoutSessionOut, PortalSessionOut, InvoiceOut } from "@/lib/api/types";

export async function listPlans() {
  return apiFetch<PlanOut[]>("public", "/billing/plans");
}

export async function getSubscription() {
  return apiFetch<SubscriptionOut>("console", "/billing/subscription");
}

export async function createCheckoutSession(planKey: string, affiliateCode?: string) {
  const qs = new URLSearchParams({ plan_key: planKey });
  if (affiliateCode) qs.set("affiliate_code", affiliateCode);
  return apiFetch<CheckoutSessionOut>("console", `/billing/checkout-session?${qs.toString()}`, { method: "POST" });
}

export async function createPortalSession() {
  return apiFetch<PortalSessionOut>("console", "/billing/portal", { method: "POST" });
}

export async function listInvoices() {
  return apiFetch<InvoiceOut[]>("console", "/billing/invoices");
}
