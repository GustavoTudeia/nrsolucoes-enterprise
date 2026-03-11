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
  employee_name?: string | null;
  employee_identifier?: string | null;
  employee_email?: string | null;
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
  progress_percent: number;
  is_overdue: boolean;
  days_until_due?: number;
  certificate_id?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface EnrollmentStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  expired: number;
  cancelled: number;
  completion_rate: number;
  overdue_count: number;
  avg_completion_days: number | null;
  certificates_issued: number;
}

export interface BulkEnrollResult {
  enrolled: number;
  already_enrolled: number;
  total_processed: number;
}

export interface CertificateOut {
  id: string;
  certificate_number: string;
  employee_id: string;
  employee_name: string;
  employee_cpf?: string | null;
  employee_identifier: string;
  training_title: string;
  training_description?: string | null;
  training_duration_minutes?: number | null;
  action_plan_title?: string | null;
  risk_dimension?: string | null;
  training_completed_at: string;
  issued_at: string;
  valid_until?: string | null;
  is_valid: boolean;
  validation_code?: string | null;
  validation_url?: string | null;
  pdf_available: boolean;
  issuer_name?: string | null;
  issuer_cnpj?: string | null;
  // NR-1 mandatory certificate fields
  instructor_name?: string | null;
  instructor_qualification?: string | null;
  training_location?: string | null;
  syllabus?: string | null;
  training_modality?: string | null;
  formal_hours_minutes?: number | null;
}

export interface CertificateGenerateResult {
  generated: number;
  skipped: number;
  errors?: string[] | null;
  message: string;
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