import { apiFetch } from "@/lib/api/client";
import type { LegalStatusOut, LegalRequiredOut } from "@/lib/api/types";

export async function getLegalRequired() {
  return apiFetch<LegalRequiredOut>("console", "/legal/required");
}

export async function getMyLegalStatus() {
  return apiFetch<LegalStatusOut>("console", "/legal/me");
}

export async function acceptLegal() {
  return apiFetch<{ status: string }>("console", "/legal/accept", { method: "POST", body: JSON.stringify({ accept: true }) });
}
