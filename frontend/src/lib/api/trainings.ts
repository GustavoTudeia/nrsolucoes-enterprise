/**
 * API de Treinamentos NR-1
 */

import { apiFetch } from "./client";
import type { Page } from "./types";

// Types
export interface EnrollTargetPayload {
  target_type: "all_employees" | "org_unit" | "cnpj" | "selected";
  target_org_unit_id?: string;
  target_cnpj_id?: string;
  selected_employee_ids?: string[];
  due_days?: number;
}

export interface EnrollmentOut {
  id: string;
  action_item_id: string;
  employee_id: string;
  employee?: {
    id: string;
    identifier: string;
    full_name?: string;
    email?: string;
    org_unit_id?: string;
    org_unit_name?: string;
  };
  status: string;
  enrolled_at: string;
  started_at?: string;
  completed_at?: string;
  due_date?: string;
  progress_percentage: number;
  is_overdue: boolean;
  days_until_due?: number;
}

export interface EnrollmentStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  expired: number;
  excused: number;
  completion_percentage: number;
  overdue_count: number;
  due_this_week: number;
}

export interface BulkEnrollResult {
  total_requested: number;
  enrolled: number;
  skipped: number;
  failed: number;
  enrollment_ids: string[];
  errors: string[];
}

export interface CertificateGenerateResult {
  generated: number;
  skipped: number;
  failed: number;
  certificate_ids: string[];
  errors: string[];
}

// API Functions
export async function enrollEmployees(
  itemId: string,
  payload: EnrollTargetPayload
): Promise<BulkEnrollResult> {
  return apiFetch<BulkEnrollResult>("console", `/trainings/items/${itemId}/enrollments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listEnrollments(
  itemId: string,
  params?: { status?: string; include_employee?: boolean; limit?: number; offset?: number }
): Promise<Page<EnrollmentOut>> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set("status", params.status);
  if (params?.include_employee) searchParams.set("include_employee", "true");
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.offset) searchParams.set("offset", String(params.offset));
  
  const query = searchParams.toString();
  return apiFetch<Page<EnrollmentOut>>("console", `/trainings/items/${itemId}/enrollments${query ? `?${query}` : ""}`);
}

export async function getEnrollmentStats(itemId: string): Promise<EnrollmentStats> {
  return apiFetch<EnrollmentStats>("console", `/trainings/items/${itemId}/enrollment-stats`);
}

export async function generateCertificates(
  itemId: string,
  payload?: { enrollment_ids?: string[]; regenerate?: boolean }
): Promise<CertificateGenerateResult> {
  return apiFetch<CertificateGenerateResult>("console", `/trainings/items/${itemId}/certificates/generate`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}