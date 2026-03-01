/**
 * API Client para Campaign Invitations
 * Sistema de tokens únicos para garantir:
 * - 1 resposta por colaborador
 * - Apenas colaboradores cadastrados
 * - Anonimato preservado (LGPD)
 */

import { apiFetch } from "@/lib/api/client";

// =============================================================================
// TYPES
// =============================================================================

export interface InvitationOut {
  id: string;
  campaign_id: string;
  employee_id: string;
  employee_name?: string;
  employee_email?: string;
  status: "pending" | "used" | "expired" | "revoked";
  expires_at: string;
  sent_at?: string;
  opened_at?: string;
  used_at?: string;
  revoked_at?: string;
  sent_via?: string;
  sent_to_email?: string;
  reminder_count: string;
  created_at: string;
}

export interface InvitationWithTokenOut {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_email?: string;
  token: string;
  survey_url: string;
  expires_at: string;
}

export interface InvitationGenerateResult {
  campaign_id: string;
  batch_id: string;
  total_eligible: number;
  total_created: number;
  total_skipped: number;
  total_sent: number;
  invitations: InvitationWithTokenOut[];
}

export interface InvitationStatsOut {
  campaign_id: string;
  total_invitations: number;
  total_pending: number;
  total_used: number;
  total_expired: number;
  total_revoked: number;
  response_rate: number;
  by_org_unit?: {
    org_unit_id?: string;
    org_unit_name: string;
    invited: number;
    responded: number;
  }[];
}

export interface InvitationValidateResult {
  valid: boolean;
  campaign_id?: string;
  campaign_name?: string;
  questionnaire_title?: string;
  expires_at?: string;
  error?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// =============================================================================
// ADMIN ENDPOINTS (requerem autenticação)
// =============================================================================

/**
 * Gera convites para colaboradores de uma campanha
 */
export async function generateInvitations(
  campaignId: string,
  payload: {
    cnpj_id?: string;
    org_unit_id?: string;
    employee_ids?: string[];
    expires_in_days?: number;
    send_email?: boolean;
  }
): Promise<InvitationGenerateResult> {
  return apiFetch<InvitationGenerateResult>(
    "console",
    `/campaigns/${encodeURIComponent(campaignId)}/invitations/generate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

/**
 * Lista convites de uma campanha
 */
export async function listInvitations(
  campaignId: string,
  params?: {
    status?: string;
    org_unit_id?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }
): Promise<Page<InvitationOut>> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  if (params?.q) qs.set("q", params.q);
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));

  return apiFetch<Page<InvitationOut>>(
    "console",
    `/campaigns/${encodeURIComponent(campaignId)}/invitations?${qs.toString()}`
  );
}

/**
 * Obtém estatísticas de convites de uma campanha
 */
export async function getInvitationStats(campaignId: string): Promise<InvitationStatsOut> {
  return apiFetch<InvitationStatsOut>(
    "console",
    `/campaigns/${encodeURIComponent(campaignId)}/invitations/stats`
  );
}

/**
 * Revoga convites
 */
export async function revokeInvitations(
  campaignId: string,
  payload: {
    invitation_ids?: string[];
    employee_ids?: string[];
    reason?: string;
  }
): Promise<{ status: string; revoked_count: number }> {
  return apiFetch<{ status: string; revoked_count: number }>(
    "console",
    `/campaigns/${encodeURIComponent(campaignId)}/invitations/revoke`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

// =============================================================================
// PUBLIC ENDPOINTS (para colaboradores, sem autenticação)
// =============================================================================

/**
 * Valida token de convite (público)
 */
export async function validateSurveyToken(
  campaignId: string,
  token: string
): Promise<InvitationValidateResult> {
  const qs = new URLSearchParams({ token });
  
  const response = await fetch(
    `/api/bff/public/public/survey/${encodeURIComponent(campaignId)}/validate?${qs.toString()}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Falha ao validar token");
  }

  return response.json();
}

/**
 * Submete resposta com token (público)
 */
export async function submitSurveyWithToken(
  campaignId: string,
  payload: {
    token: string;
    org_unit_id?: string;
    answers: Record<string, number | string>;
  }
): Promise<{ status: string; message: string }> {
  const response = await fetch(
    `/api/bff/public/public/survey/${encodeURIComponent(campaignId)}/submit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || "Falha ao enviar resposta");
  }

  return response.json();
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Gera CSV com os links de convite para download
 */
export function generateInvitationsCsv(invitations: InvitationWithTokenOut[]): string {
  const header = "Nome;Email;Link da Pesquisa;Expira em";
  const rows = invitations.map((inv) => {
    const expiresAt = new Date(inv.expires_at).toLocaleDateString("pt-BR");
    return `${inv.employee_name || "-"};${inv.employee_email || "-"};${inv.survey_url};${expiresAt}`;
  });
  return [header, ...rows].join("\n");
}

/**
 * Faz download do CSV de convites
 */
export function downloadInvitationsCsv(invitations: InvitationWithTokenOut[], campaignName: string) {
  const csv = generateInvitationsCsv(invitations);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); // BOM para Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `convites_${campaignName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copia todos os links para o clipboard
 */
export async function copyInvitationLinks(invitations: InvitationWithTokenOut[]): Promise<void> {
  const links = invitations.map((inv) => `${inv.employee_name || inv.employee_email}: ${inv.survey_url}`).join("\n");
  await navigator.clipboard.writeText(links);
}
