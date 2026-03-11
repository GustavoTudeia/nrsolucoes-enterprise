/**
 * API Client - Plano de Ação Enterprise 2.0
 * 
 * Inclui todas as operações para:
 * - CRUD de planos e itens
 * - Comentários e colaboração
 * - Upload de evidências
 * - Histórico de mudanças
 * - Dashboard e estatísticas
 */

import { apiFetch } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";

// =============================================================================
// TYPES
// =============================================================================

export interface ResponsibleUserInfo {
  id: string;
  email: string;
  full_name?: string | null;
}

export interface ActionPlanStats {
  total_items: number;
  planned: number;
  in_progress: number;
  done: number;
  blocked: number;
  cancelled: number;
  overdue: number;
  completion_percentage: number;
  by_type?: Record<string, number>;
  by_priority?: Record<string, number>;
}

export interface ActionEvidenceOut {
  id: string;
  action_item_id: string;
  evidence_type: string;
  reference: string;
  note?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  file_type?: string | null;
  storage_key?: string | null;
  created_by_user_id?: string | null;
  created_by_user?: ResponsibleUserInfo | null;
  created_at: string;
}

export interface ActionItemCommentOut {
  id: string;
  action_item_id: string;
  user_id: string;
  user?: ResponsibleUserInfo | null;
  content: string;
  mentions?: string[] | null;
  edited_at?: string | null;
  created_at: string;
}

export interface ActionItemHistoryOut {
  id: string;
  action_item_id: string;
  user_id?: string | null;
  user?: ResponsibleUserInfo | null;
  field_changed: string;
  old_value?: string | null;
  new_value?: string | null;
  changed_at: string;
}

export interface ActionItemOut {
  id: string;
  action_plan_id: string;
  item_type: "educational" | "organizational" | "administrative" | "support";
  title: string;
  description?: string | null;
  responsible?: string | null;
  responsible_user_id?: string | null;
  responsible_user?: ResponsibleUserInfo | null;
  due_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  status: string;
  priority: string;
  related_dimension?: string | null;
  education_ref_type?: string | null;
  education_ref_id?: string | null;
  control_hierarchy?: "elimination" | "substitution" | "epc" | "administrative" | "epi" | null;
  training_type?: "initial" | "periodic" | "eventual" | null;
  monitoring_frequency?: "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | null;
  effectiveness_criteria?: string | null;
  affected_workers_count?: number | null;
  created_by_user_id?: string | null;
  created_at: string;
  is_overdue: boolean;
  days_until_due?: number | null;
  evidences?: ActionEvidenceOut[] | null;
  comments?: ActionItemCommentOut[] | null;
  history?: ActionItemHistoryOut[] | null;
  evidence_count: number;
  comment_count: number;
  // Enrollment targeting & stats
  target_type?: string | null;
  target_org_unit_id?: string | null;
  target_cnpj_id?: string | null;
  auto_enroll?: boolean;
  enrollment_due_days?: number;
  enrollment_total?: number;
  enrollment_completed?: number;
  enrollment_in_progress?: number;
  enrollment_pending?: number;
}

export interface ActionPlanOut {
  id: string;
  risk_assessment_id: string;
  status: string;
  version: number;
  title?: string | null;
  description?: string | null;
  target_completion_date?: string | null;
  closed_at?: string | null;
  created_by_user_id?: string | null;
  closed_by_user_id?: string | null;
  created_at: string;
  items?: ActionItemOut[] | null;
  stats?: ActionPlanStats | null;
}

export interface ActionPlanDashboard {
  total_plans: number;
  open_plans: number;
  closed_plans: number;
  total_items: number;
  items_planned: number;
  items_in_progress: number;
  items_done: number;
  items_overdue: number;
  overall_completion: number;
  critical_items: ActionItemOut[];
  overdue_items: ActionItemOut[];
  due_this_week: ActionItemOut[];
  by_responsible?: Array<{ name: string; total: number; done: number }>;
}

// =============================================================================
// PLAN OPERATIONS
// =============================================================================

export async function createActionPlan(payload: {
  risk_assessment_id: string;
  title?: string;
  description?: string;
  target_completion_date?: string;
}) {
  return apiFetch<{ id: string; status: string }>("console", "/action-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateActionPlan(
  planId: string,
  payload: {
    title?: string;
    description?: string;
    status?: string;
    target_completion_date?: string;
  }
) {
  return apiFetch<{ id: string; status: string }>(
    "console",
    `/action-plans/${encodeURIComponent(planId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    }
  );
}

export async function listActionPlans(params?: {
  risk_assessment_id?: string;
  campaign_id?: string;
  cnpj_id?: string;
  org_unit_id?: string;
  status?: string;
  include_items?: boolean;
  include_evidences?: boolean;
  include_stats?: boolean;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.risk_assessment_id) qs.set("risk_assessment_id", params.risk_assessment_id);
  if (params?.campaign_id) qs.set("campaign_id", params.campaign_id);
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.include_items) qs.set("include_items", "true");
  if (params?.include_evidences) qs.set("include_evidences", "true");
  if (params?.include_stats) qs.set("include_stats", "true");
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<Page<ActionPlanOut>>("console", `/action-plans?${qs.toString()}`);
}

export async function getActionPlan(
  planId: string,
  opts?: {
    include_items?: boolean;
    include_evidences?: boolean;
    include_stats?: boolean;
  }
) {
  const qs = new URLSearchParams();
  if (opts?.include_items === false) qs.set("include_items", "false");
  if (opts?.include_evidences === false) qs.set("include_evidences", "false");
  if (opts?.include_stats === false) qs.set("include_stats", "false");
  const tail = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<ActionPlanOut>("console", `/action-plans/${encodeURIComponent(planId)}${tail}`);
}

export async function getActionPlanDashboard(params?: {
  cnpj_id?: string;
  org_unit_id?: string;
}) {
  const qs = new URLSearchParams();
  if (params?.cnpj_id) qs.set("cnpj_id", params.cnpj_id);
  if (params?.org_unit_id) qs.set("org_unit_id", params.org_unit_id);
  return apiFetch<ActionPlanDashboard>("console", `/action-plans/dashboard?${qs.toString()}`);
}

// =============================================================================
// ITEM OPERATIONS
// =============================================================================

export async function addActionItem(
  planId: string,
  payload: {
    item_type: "educational" | "organizational" | "administrative" | "support";
    title: string;
    description?: string;
    responsible?: string;
    responsible_user_id?: string;
    due_date?: string;
    status?: string;
    priority?: string;
    related_dimension?: string;
    education_ref_type?: string | null;
    education_ref_id?: string | null;
    control_hierarchy?: string;
    training_type?: string;
    monitoring_frequency?: string;
    effectiveness_criteria?: string;
    affected_workers_count?: number;
    // Enrollment targeting
    target_type?: string;
    target_org_unit_id?: string;
    target_cnpj_id?: string;
    auto_enroll?: boolean;
    enrollment_due_days?: number;
    notify_on_assignment?: boolean;
    notify_before_due?: boolean;
    notify_days_before?: number;
  }
) {
  return apiFetch<{ id: string }>(
    "console",
    `/action-plans/${encodeURIComponent(planId)}/items`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function updateActionItem(
  itemId: string,
  payload: {
    title?: string;
    description?: string;
    responsible?: string;
    responsible_user_id?: string | null;
    due_date?: string | null;
    status?: string;
    priority?: string;
    related_dimension?: string;
    education_ref_type?: string | null;
    education_ref_id?: string | null;
    control_hierarchy?: string | null;
    training_type?: string | null;
    monitoring_frequency?: string | null;
    effectiveness_criteria?: string | null;
    affected_workers_count?: number | null;
    // Enrollment targeting
    target_type?: string;
    target_org_unit_id?: string;
    target_cnpj_id?: string;
    auto_enroll?: boolean;
    enrollment_due_days?: number;
  }
) {
  return apiFetch<{ id: string }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

export async function deleteActionItem(itemId: string) {
  return apiFetch<{ deleted: boolean }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" }
  );
}

export async function listActionItems(
  planId: string,
  opts?: {
    status?: string;
    priority?: string;
    responsible_user_id?: string;
    include_evidences?: boolean;
    include_comments?: boolean;
    limit?: number;
    offset?: number;
  }
) {
  const qs = new URLSearchParams();
  if (opts?.status) qs.set("status", opts.status);
  if (opts?.priority) qs.set("priority", opts.priority);
  if (opts?.responsible_user_id) qs.set("responsible_user_id", opts.responsible_user_id);
  if (opts?.include_evidences) qs.set("include_evidences", "true");
  if (opts?.include_comments) qs.set("include_comments", "true");
  qs.set("limit", String(opts?.limit ?? 100));
  qs.set("offset", String(opts?.offset ?? 0));
  return apiFetch<Page<ActionItemOut>>(
    "console",
    `/action-plans/${encodeURIComponent(planId)}/items?${qs.toString()}`
  );
}

export async function getActionItem(
  itemId: string,
  opts?: {
    include_evidences?: boolean;
    include_comments?: boolean;
    include_history?: boolean;
  }
) {
  const qs = new URLSearchParams();
  if (opts?.include_evidences === false) qs.set("include_evidences", "false");
  if (opts?.include_comments === false) qs.set("include_comments", "false");
  if (opts?.include_history) qs.set("include_history", "true");
  const tail = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<ActionItemOut>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}${tail}`
  );
}

// =============================================================================
// BULK OPERATIONS
// =============================================================================

export async function bulkUpdateStatus(itemIds: string[], status: string) {
  return apiFetch<{ updated: number }>("console", "/action-plans/items/bulk-status", {
    method: "POST",
    body: JSON.stringify({ item_ids: itemIds, status }),
  });
}

export async function bulkAssignResponsible(itemIds: string[], responsibleUserId: string) {
  return apiFetch<{ updated: number }>("console", "/action-plans/items/bulk-assign", {
    method: "POST",
    body: JSON.stringify({ item_ids: itemIds, responsible_user_id: responsibleUserId }),
  });
}

// =============================================================================
// EVIDENCE OPERATIONS
// =============================================================================

export async function addEvidence(
  itemId: string,
  payload: {
    evidence_type: string;
    reference: string;
    note?: string;
    file_name?: string;
    file_size?: number;
    file_type?: string;
    storage_key?: string;
  }
) {
  return apiFetch<{ id: string }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/evidences`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function deleteEvidence(itemId: string, evidenceId: string) {
  return apiFetch<{ deleted: boolean }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/evidences/${encodeURIComponent(evidenceId)}`,
    { method: "DELETE" }
  );
}

export async function listActionEvidences(
  itemId: string,
  opts?: { limit?: number; offset?: number }
) {
  const qs = new URLSearchParams();
  qs.set("limit", String(opts?.limit ?? 100));
  qs.set("offset", String(opts?.offset ?? 0));
  return apiFetch<Page<ActionEvidenceOut>>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/evidences?${qs.toString()}`
  );
}

// =============================================================================
// FILE UPLOAD OPERATIONS
// =============================================================================

export async function getEvidenceUploadUrl(
  itemId: string,
  fileName: string,
  contentType: string
) {
  const qs = new URLSearchParams();
  qs.set("file_name", fileName);
  qs.set("content_type", contentType);
  return apiFetch<{ upload_url: string; storage_key: string; expires_in: number }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/evidences/upload-url?${qs.toString()}`,
    { method: "POST" }
  );
}

export async function getEvidenceDownloadUrl(itemId: string, evidenceId: string) {
  return apiFetch<{ download_url: string; file_name: string; expires_in: number }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/evidences/${encodeURIComponent(evidenceId)}/download-url`
  );
}

export async function uploadEvidenceFile(
  itemId: string,
  file: File,
  note?: string
): Promise<{ id: string }> {
  // 1. Obter URL presigned
  const { upload_url, storage_key } = await getEvidenceUploadUrl(
    itemId,
    file.name,
    file.type || "application/octet-stream"
  );

  // 2. Fazer upload direto para MinIO/S3
  const uploadResponse = await fetch(upload_url, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type || "application/octet-stream",
    },
  });

  if (!uploadResponse.ok) {
    throw new Error("Falha no upload do arquivo");
  }

  // 3. Registrar evidência no backend
  return addEvidence(itemId, {
    evidence_type: "file",
    reference: file.name,
    note,
    file_name: file.name,
    file_size: file.size,
    file_type: file.type,
    storage_key,
  });
}

// =============================================================================
// COMMENT OPERATIONS
// =============================================================================

export async function addComment(
  itemId: string,
  payload: { content: string; mentions?: string[] }
) {
  return apiFetch<{ id: string }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/comments`,
    { method: "POST", body: JSON.stringify(payload) }
  );
}

export async function updateComment(
  itemId: string,
  commentId: string,
  payload: { content: string }
) {
  return apiFetch<{ id: string }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

export async function deleteComment(itemId: string, commentId: string) {
  return apiFetch<{ deleted: boolean }>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" }
  );
}

export async function listComments(
  itemId: string,
  opts?: { limit?: number; offset?: number }
) {
  const qs = new URLSearchParams();
  qs.set("limit", String(opts?.limit ?? 100));
  qs.set("offset", String(opts?.offset ?? 0));
  return apiFetch<Page<ActionItemCommentOut>>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/comments?${qs.toString()}`
  );
}

// =============================================================================
// HISTORY OPERATIONS
// =============================================================================

export async function listHistory(
  itemId: string,
  opts?: { limit?: number; offset?: number }
) {
  const qs = new URLSearchParams();
  qs.set("limit", String(opts?.limit ?? 100));
  qs.set("offset", String(opts?.offset ?? 0));
  return apiFetch<Page<ActionItemHistoryOut>>(
    "console",
    `/action-plans/items/${encodeURIComponent(itemId)}/history?${qs.toString()}`
  );
}

// =============================================================================
// USERS FOR ASSIGNMENT
// =============================================================================

export async function listAssignableUsers(q?: string, limit?: number) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  qs.set("limit", String(limit ?? 20));
  return apiFetch<ResponsibleUserInfo[]>("console", `/action-plans/users?${qs.toString()}`);
}
