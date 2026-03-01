import { apiFetch } from "@/lib/api/client";
import type { ContentOut, ContentUploadOut, ContentAccessOut, LMSAssignmentOut, Page } from "@/lib/api/types";

export async function listContents() {
  return apiFetch<ContentOut[]>("console", "/lms/contents");
}

export async function createContent(payload: {
  title: string;
  description?: string;
  content_type: string;
  url?: string | null;
  duration_minutes?: number;
  is_platform_managed?: boolean;
}) {
  return apiFetch<ContentOut>("console", "/lms/contents", { method: "POST", body: JSON.stringify(payload) });
}

export async function createContentUpload(payload: {
  title: string;
  description?: string;
  filename: string;
  mime_type: string;
  duration_seconds?: number;
  is_platform_managed?: boolean;
}) {
  return apiFetch<ContentUploadOut>("console", "/lms/contents/upload", { method: "POST", body: JSON.stringify(payload) });
}

export async function getContentAccess(content_id: string) {
  return apiFetch<ContentAccessOut>("console", `/lms/contents/${content_id}/access`);
}

export async function createAssignment(payload: { content_item_id?: string; learning_path_id?: string; employee_id?: string | null; org_unit_id?: string | null }) {
  return apiFetch<{ id: string }>("console", "/lms/assignments", { method: "POST", body: JSON.stringify(payload) });
}

export async function listAssignments(params?: { employee_id?: string; org_unit_id?: string; content_item_id?: string; status?: string; limit?: number; offset?: number }) {
  const qs = new URLSearchParams();
  if (params?.employee_id) qs.set("employee_id", params.employee_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  if (params?.content_item_id) qs.set("content_item_id", params.content_item_id);
  if (params?.status) qs.set("status", params.status);
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<Page<LMSAssignmentOut>>("console", `/lms/assignments?${qs.toString()}`);
}
