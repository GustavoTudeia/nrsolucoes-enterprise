import { apiFetch } from "@/lib/api/client";
import type { AffiliateOut, LedgerOut, PayoutOut } from "@/lib/api/types";

export async function listAffiliates() {
  return apiFetch<AffiliateOut[]>("console", "/affiliates");
}

export async function createAffiliate(payload: { code: string; name: string; email?: string; document?: string; discount_percent: number; commission_percent: number }) {
  return apiFetch<AffiliateOut>("console", "/affiliates", { method: "POST", body: JSON.stringify(payload) });
}

export async function listLedger(status?: string) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<LedgerOut[]>("console", `/affiliates/ledger${qs}`);
}

export async function createPayout(affiliateId: string, payload: { amount: number; method?: string; reference?: string }) {
  return apiFetch<PayoutOut>("console", `/affiliates/${encodeURIComponent(affiliateId)}/payouts`, { method: "POST", body: JSON.stringify(payload) });
}

export async function markPayoutPaid(payoutId: string) {
  return apiFetch<PayoutOut>("console", `/affiliates/payouts/${encodeURIComponent(payoutId)}/mark-paid`, { method: "POST" });
}
