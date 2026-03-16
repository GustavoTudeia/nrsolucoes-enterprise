import { apiFetch } from "@/lib/api/client";
import type { PlanOut, SubscriptionOut, CheckoutSessionOut, PortalSessionOut, InvoiceOut, BillingProfileOut, BillingProfileStatusOut, OnboardingOverviewOut } from "@/lib/api/types";

export async function listPlans() { return apiFetch<PlanOut[]>("public", "/billing/plans"); }
export async function getSubscription() { return apiFetch<SubscriptionOut>("console", "/billing/subscription"); }
export async function getBillingProfile() { return apiFetch<BillingProfileOut>("console", "/billing/profile"); }
export async function updateBillingProfile(payload: Partial<BillingProfileOut>) {
  return apiFetch<BillingProfileOut>("console", "/billing/profile", { method: "PUT", body: JSON.stringify(payload) });
}
export async function getBillingProfileStatus() { return apiFetch<BillingProfileStatusOut>("console", "/billing/profile/status"); }
export async function getBillingOnboarding() { return apiFetch<OnboardingOverviewOut>("console", "/billing/onboarding"); }
export async function createCheckoutSession(planKey: string, billingPeriod: "monthly" | "annual" = "monthly", affiliateCode?: string) {
  const qs = new URLSearchParams({ plan_key: planKey, billing_period: billingPeriod });
  if (affiliateCode) qs.set("affiliate_code", affiliateCode);
  return apiFetch<CheckoutSessionOut>("console", `/billing/checkout-session?${qs.toString()}`, { method: "POST" });
}
export async function createPortalSession() { return apiFetch<PortalSessionOut>("console", "/billing/portal", { method: "POST" }); }
export async function listInvoices() { return apiFetch<InvoiceOut[]>("console", "/billing/invoices"); }
export async function requestInvoiceIssue(invoiceId: string) { return apiFetch<{ ok: boolean; status: string }>("console", `/billing/invoices/${invoiceId}/request-issue`, { method: "POST" }); }
export async function resendInvoiceEmail(invoiceId: string, recipientEmail?: string) {
  const qs = new URLSearchParams(); if (recipientEmail) qs.set("recipient_email", recipientEmail);
  return apiFetch<{ ok: boolean; emailed_at?: string | null }>("console", `/billing/invoices/${invoiceId}/resend-email?${qs.toString()}`, { method: "POST" });
}
