import { apiFetch } from "@/lib/api/client";
import type { TenantSettingsOut, SSOConfigOut } from "@/lib/api/types";

export async function getTenantSettings() {
  return apiFetch<TenantSettingsOut>("console", "/settings/tenant");
}

export async function updatePrivacySettings(payload: { min_anon_threshold: number }) {
  return apiFetch<TenantSettingsOut>("console", "/settings/privacy", { method: "PATCH", body: JSON.stringify(payload) });
}

export async function updateBrandingSettings(payload: Partial<TenantSettingsOut>) {
  return apiFetch<TenantSettingsOut>("console", "/settings/branding", { method: "PATCH", body: JSON.stringify(payload) });
}

export async function getSsoConfig() {
  return apiFetch<SSOConfigOut>("console", "/settings/sso");
}

export async function updateSsoConfig(payload: { enabled?: boolean; issuer_url?: string; client_id?: string; client_secret?: string; allowed_domains?: string[] }) {
  return apiFetch<SSOConfigOut>("console", "/settings/sso", { method: "PATCH", body: JSON.stringify(payload) });
}
