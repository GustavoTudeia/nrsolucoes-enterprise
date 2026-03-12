import { apiFetch } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";

export interface AuditEventOut {
  id: string;
  tenant_id?: string | null;
  actor_user_id?: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  before_json?: any;
  after_json?: any;
  ip?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
  created_at: string;
}

export async function listAuditEvents(params?: {
  action?: string;
  entity_type?: string;
  entity_id?: string;
  actor_user_id?: string;
  q?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.action) qs.set("action", params.action);
  if (params?.entity_type) qs.set("entity_type", params.entity_type);
  if (params?.entity_id) qs.set("entity_id", params.entity_id);
  if (params?.actor_user_id) qs.set("actor_user_id", params.actor_user_id);
  if (params?.q) qs.set("q", params.q);
  if (params?.since) qs.set("since", params.since);
  if (params?.until) qs.set("until", params.until);
  qs.set("limit", String(params?.limit ?? 50));
  qs.set("offset", String(params?.offset ?? 0));
  return apiFetch<Page<AuditEventOut>>("console", `/audit/events?${qs.toString()}`);
}
