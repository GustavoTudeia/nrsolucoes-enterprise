import { apiFetch } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";

export interface QuestionnaireTemplateOut {
  id: string;
  tenant_id?: string | null;
  key: string;
  name: string;
  description?: string | null;
  is_platform_managed: boolean;
  is_active: boolean;
}

export interface QuestionnaireVersionOut {
  id: string;
  template_id: string;
  version: number;
  status: string;
  content: any;
}

export async function createTemplate(payload: { key: string; name: string; description?: string; is_platform_managed?: boolean }) {
  return apiFetch<QuestionnaireTemplateOut>("console", "/questionnaires/templates", { method: "POST", body: JSON.stringify(payload) });
}

export async function createVersion(templateId: string, payload: { content: any }) {
  return apiFetch<QuestionnaireVersionOut>("console", `/questionnaires/templates/${encodeURIComponent(templateId)}/versions`, { method: "POST", body: JSON.stringify(payload) });
}

export async function publishVersion(versionId: string) {
  return apiFetch<QuestionnaireVersionOut>("console", `/questionnaires/versions/${encodeURIComponent(versionId)}/publish`, { method: "POST" });
}


export interface QuestionnaireTemplateDetailOut extends QuestionnaireTemplateOut {
  created_at: string;
  updated_at: string;
}

export interface QuestionnaireVersionDetailOut extends QuestionnaireVersionOut {
  created_at: string;
  updated_at: string;
  published_at?: string | null;
}

export async function listTemplates(params?: { q?: string; is_active?: boolean; is_platform_managed?: boolean; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.is_active !== undefined) qs.set("is_active", String(params.is_active));
  if (params?.is_platform_managed !== undefined) qs.set("is_platform_managed", String(params.is_platform_managed));
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<Page<QuestionnaireTemplateDetailOut>>("console", `/questionnaires/templates?${qs.toString()}`);
}

export async function getTemplate(templateId: string) {
  return apiFetch<QuestionnaireTemplateDetailOut>("console", `/questionnaires/templates/${encodeURIComponent(templateId)}`);
}

export async function listVersions(templateId: string, params?: { status?: string; published_only?: boolean; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.published_only) qs.set("published_only", "true");
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<Page<QuestionnaireVersionDetailOut>>("console", `/questionnaires/templates/${encodeURIComponent(templateId)}/versions?${qs.toString()}`);
}

export async function getVersion(versionId: string) {
  return apiFetch<QuestionnaireVersionDetailOut>("console", `/questionnaires/versions/${encodeURIComponent(versionId)}`);
}

export async function getLatestPublishedByKey(key: string) {
  return apiFetch<QuestionnaireVersionDetailOut>("console", `/questionnaires/published?key=${encodeURIComponent(key)}`);
}
