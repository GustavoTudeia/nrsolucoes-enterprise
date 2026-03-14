import { apiFetch } from "@/lib/api/client";
import type { AffiliateResolveOut, PublicTenantResolveOut, AuthLoginResponse } from "@/lib/api/types";

export async function resolveAffiliate(code: string) {
  return apiFetch<AffiliateResolveOut>("public", `/public/affiliate/resolve?code=${encodeURIComponent(code)}`);
}

export async function touchAffiliate(code: string) {
  return apiFetch<{ status: string }>("public", `/public/affiliate/touch?code=${encodeURIComponent(code)}`, { method: "POST" });
}

export async function resolveTenantBySlug(slug: string) {
  return apiFetch<PublicTenantResolveOut>("public", `/public/tenants/resolve?slug=${encodeURIComponent(slug)}`);
}

export async function publicSignup(payload: {
  company_name: string;
  slug: string;
  admin_email: string;
  admin_name?: string;
  admin_password: string;
  affiliate_code?: string;
  plan_key?: string;
  cnpj?: string;
  admin_cpf?: string;
  admin_phone?: string;
}) {
  // via Next route handler (sets console token)
  const res = await fetch("/api/auth/public/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.detail || "Falha no cadastro");
  return data as { tenant_id: string; access_token: string; token_type: string };
}


export interface PublicCampaignOut {
  campaign: { id: string; name: string };
  min_anon_threshold: number;
  allow_org_unit_selection: boolean;
  org_units: { id: string; name: string; unit_type: string }[];
  questionnaire_version_id: string;
  questionnaire: any;
}

export async function getPublicCampaign(campaignId: string) {
  return apiFetch<PublicCampaignOut>("public", `/public/campaigns/${encodeURIComponent(campaignId)}`);
}

export async function submitSurveyResponse(campaignId: string, payload: { org_unit_id?: string; answers: Record<string, any> }) {
  return apiFetch<{ status: string }>("public", `/campaigns/${encodeURIComponent(campaignId)}/responses`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
