import { apiFetch } from "@/lib/api/client";
import type { ContentOut, ContentUploadOut, ContentAccessOut, LMSAssignmentOut, Page } from "@/lib/api/types";

// ============ Contents ============

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

export async function updateContent(contentId: string, payload: {
  title?: string;
  description?: string;
  url?: string;
  duration_minutes?: number;
  is_active?: boolean;
}) {
  return apiFetch<ContentOut>("console", `/lms/contents/${contentId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteContent(contentId: string) {
  return apiFetch<{ deleted: boolean }>("console", `/lms/contents/${contentId}`, { method: "DELETE" });
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

// ============ Learning Paths ============

export interface LearningPathItemOut {
  id: string;
  content_item_id: string;
  order_index: number;
  content_title?: string | null;
}

export interface LearningPathOut {
  id: string;
  tenant_id?: string | null;
  title: string;
  description?: string | null;
  is_platform_managed: boolean;
  is_active: boolean;
  items: LearningPathItemOut[];
  created_at: string;
}

export async function listLearningPaths() {
  return apiFetch<LearningPathOut[]>("console", "/lms/learning-paths");
}

export async function getLearningPath(pathId: string) {
  return apiFetch<LearningPathOut>("console", `/lms/learning-paths/${pathId}`);
}

export async function createLearningPath(payload: {
  title: string;
  description?: string;
  content_item_ids: string[];
}) {
  return apiFetch<LearningPathOut>("console", "/lms/learning-paths", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateLearningPath(pathId: string, payload: {
  title?: string;
  description?: string;
  content_item_ids?: string[];
}) {
  return apiFetch<LearningPathOut>("console", `/lms/learning-paths/${pathId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteLearningPath(pathId: string) {
  return apiFetch<{ deleted: boolean }>("console", `/lms/learning-paths/${pathId}`, { method: "DELETE" });
}

// ============ Assignments ============

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

export async function createAssignment(payload: { content_item_id?: string; learning_path_id?: string; employee_id?: string | null; org_unit_id?: string | null }) {
  return apiFetch<{ id: string }>("console", "/lms/assignments", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateAssignment(assignmentId: string, payload: { due_at?: string; status?: string }) {
  return apiFetch<LMSAssignmentOut>("console", `/lms/assignments/${assignmentId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export async function deleteAssignment(assignmentId: string) {
  return apiFetch<{ deleted: boolean }>("console", `/lms/assignments/${assignmentId}`, { method: "DELETE" });
}

export async function bulkCreateAssignments(payload: {
  content_item_id?: string;
  learning_path_id?: string;
  employee_ids?: string[];
  org_unit_ids?: string[];
}) {
  return apiFetch<{ created: number }>("console", "/lms/assignments/bulk", { method: "POST", body: JSON.stringify(payload) });
}

// ============ Completions ============

export async function createCompletion(payload: { assignment_id: string; completion_method?: string }) {
  return apiFetch<{ id: string }>("console", "/lms/completions", { method: "POST", body: JSON.stringify(payload) });
}

// ============ Stats ============

export interface LMSStatsOut {
  total_contents: number;
  total_assignments: number;
  total_completed: number;
  total_in_progress: number;
  completion_rate: number;
  contents_by_type: Record<string, number>;
  assignments_by_status: Record<string, number>;
}

export async function getLMSStats() {
  return apiFetch<LMSStatsOut>("console", "/lms/stats");
}
