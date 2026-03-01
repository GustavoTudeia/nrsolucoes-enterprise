import { apiFetch } from "@/lib/api/client";
import type { Page, ESocialExportOut, S2240ProfileOut, S2210AccidentOut, S2220ExamOut } from "@/lib/api/types";

// --------------------
// S-2240 Profiles
// --------------------
export async function listS2240Profiles(limit: number = 50, offset: number = 0) {
  return apiFetch<Page<S2240ProfileOut>>("console", `/esocial/s2240/profiles?limit=${limit}&offset=${offset}`);
}

export async function createS2240Profile(payload: {
  cnpj_id: string;
  org_unit_id?: string | null;
  role_name: string;
  environment_code?: string | null;
  activity_description?: string | null;
  factors: Array<{ code: string; name: string; details?: string | null; intensity?: string | null }>;
  controls?: any;
  valid_from?: string | null;
  valid_to?: string | null;
  is_active?: boolean;
}) {
  return apiFetch<S2240ProfileOut>("console", "/esocial/s2240/profiles", { method: "POST", body: JSON.stringify(payload) });
}

export async function exportS2240Profile(profileId: string) {
  return apiFetch<ESocialExportOut>("console", `/esocial/s2240/profiles/${profileId}/export`);
}

// --------------------
// S-2210 Accidents
// --------------------
export async function listS2210Accidents(limit: number = 50, offset: number = 0) {
  return apiFetch<Page<S2210AccidentOut>>("console", `/esocial/s2210/accidents?limit=${limit}&offset=${offset}`);
}

export async function createS2210Accident(payload: {
  employee_id: string;
  occurred_at?: string | null;
  accident_type?: string | null;
  description?: string | null;
  location?: string | null;
  cat_number?: string | null;
  payload?: any;
}) {
  return apiFetch<S2210AccidentOut>("console", "/esocial/s2210/accidents", { method: "POST", body: JSON.stringify(payload) });
}

export async function exportS2210Accident(accidentId: string) {
  return apiFetch<ESocialExportOut>("console", `/esocial/s2210/accidents/${accidentId}/export`);
}

// --------------------
// S-2220 Exams
// --------------------
export async function listS2220Exams(limit: number = 50, offset: number = 0) {
  return apiFetch<Page<S2220ExamOut>>("console", `/esocial/s2220/exams?limit=${limit}&offset=${offset}`);
}

export async function createS2220Exam(payload: {
  employee_id: string;
  exam_date?: string | null;
  exam_type?: string | null;
  result?: string | null;
  payload?: any;
}) {
  return apiFetch<S2220ExamOut>("console", "/esocial/s2220/exams", { method: "POST", body: JSON.stringify(payload) });
}

export async function exportS2220Exam(examId: string) {
  return apiFetch<ESocialExportOut>("console", `/esocial/s2220/exams/${examId}/export`);
}
