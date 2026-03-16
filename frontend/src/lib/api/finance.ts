import { apiFetch } from "@/lib/api/client";
import type { PlatformBillingConfigOut, FinanceOverviewOut, BillingInvoiceAdminOut } from "@/lib/api/types";
export async function getFinanceOverview() { return apiFetch<FinanceOverviewOut>("console", "/platform/finance/overview"); }
export async function getFinanceProviderConfig() { return apiFetch<PlatformBillingConfigOut>("console", "/platform/finance/provider"); }
export async function updateFinanceProviderConfig(payload: Partial<PlatformBillingConfigOut>) {
  return apiFetch<PlatformBillingConfigOut>("console", "/platform/finance/provider", { method: "PUT", body: JSON.stringify(payload) });
}
export async function listFinanceInvoices(params?: { q?: string; payment_status?: string; fiscal_status?: string }) {
  const qs = new URLSearchParams(); if (params?.q) qs.set('q', params.q); if (params?.payment_status) qs.set('payment_status', params.payment_status); if (params?.fiscal_status) qs.set('fiscal_status', params.fiscal_status);
  return apiFetch<BillingInvoiceAdminOut[]>("console", `/platform/finance/invoices?${qs.toString()}`);
}
export async function issueFinanceInvoice(invoiceId: string, payload?: { manual_number?: string; verification_code?: string; fiscal_pdf_url?: string; fiscal_xml_url?: string; notes?: string }) {
  const qs = new URLSearchParams(); if (payload?.manual_number) qs.set('manual_number', payload.manual_number); if (payload?.verification_code) qs.set('verification_code', payload.verification_code); if (payload?.fiscal_pdf_url) qs.set('fiscal_pdf_url', payload.fiscal_pdf_url); if (payload?.fiscal_xml_url) qs.set('fiscal_xml_url', payload.fiscal_xml_url); if (payload?.notes) qs.set('notes', payload.notes);
  return apiFetch<{ ok: boolean; fiscal_status: string; number?: string | null }>("console", `/platform/finance/invoices/${invoiceId}/issue?${qs.toString()}`, { method: "POST" });
}
export async function sendFinanceInvoice(invoiceId: string, recipient_email?: string) {
  const qs = new URLSearchParams(); if (recipient_email) qs.set('recipient_email', recipient_email);
  return apiFetch<{ ok: boolean; emailed_at?: string | null }>("console", `/platform/finance/invoices/${invoiceId}/send?${qs.toString()}`, { method: "POST" });
}
