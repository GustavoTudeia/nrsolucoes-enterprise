"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { listAuditEvents, type AuditEventOut } from "@/lib/api/audit";
import {
  Activity, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Download, FileText, Pencil, Plus, Search, Trash2, Shield,
  RefreshCw, ArrowRightLeft,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAGE_SIZE = 50;

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof Plus }> = {
  CREATE: { label: "Criacao", color: "bg-emerald-100 text-emerald-700", icon: Plus },
  UPDATE: { label: "Alteracao", color: "bg-blue-100 text-blue-700", icon: Pencil },
  DELETE: { label: "Exclusao", color: "bg-red-100 text-red-700", icon: Trash2 },
  EXPORT: { label: "Exportacao", color: "bg-violet-100 text-violet-700", icon: Download },
  LOGIN: { label: "Login", color: "bg-amber-100 text-amber-700", icon: Shield },
  LOGIN_SSO: { label: "Login SSO", color: "bg-amber-100 text-amber-700", icon: Shield },
  BULK_ENROLL: { label: "Matricula em lote", color: "bg-indigo-100 text-indigo-700", icon: Plus },
  CANCEL: { label: "Cancelamento", color: "bg-orange-100 text-orange-700", icon: Trash2 },
  EXECUTE: { label: "Execucao", color: "bg-teal-100 text-teal-700", icon: Activity },
};

const ENTITY_LABELS: Record<string, string> = {
  CAMPAIGN: "Campanha",
  ACTION_PLAN: "Plano de Acao",
  ACTION_ITEM: "Item de Acao",
  ACTION_ITEM_ENROLLMENT: "Matricula",
  ACTION_EVIDENCE: "Evidencia",
  ACTION_COMMENT: "Comentario",
  RISK_CRITERION: "Criterio de Risco",
  RISK_ASSESSMENT: "Avaliacao de Risco",
  CONTENT_ITEM: "Conteudo LMS",
  CONTENT_UPLOAD: "Upload de Conteudo",
  CONTENT_ASSIGNMENT: "Atribuicao de Conteudo",
  CONTENT_ASSIGNMENT_BULK: "Atribuicao em Lote",
  CONTENT_COMPLETION: "Conclusao de Conteudo",
  CONTENT_PROGRESS: "Progresso",
  LEARNING_PATH: "Trilha de Aprendizagem",
  CNPJ: "CNPJ",
  ORG_UNIT: "Unidade/Setor",
  EMPLOYEE: "Colaborador",
  USER: "Usuario",
  USER_INVITATION: "Convite de Usuario",
  TENANT: "Tenant",
  TENANT_SUBSCRIPTION: "Assinatura",
  TEMPLATE_PACK: "Pacote de Templates",
  TEMPLATE_PACK_ITEM: "Item de Template",
  QUESTIONNAIRE_TEMPLATE: "Questionario",
  QUESTIONNAIRE_VERSION: "Versao de Questionario",
  ESOCIAL_S2240_PROFILE: "eSocial S-2240",
  ESOCIAL_S2210_ACCIDENT: "eSocial S-2210",
  ESOCIAL_S2220_EXAM: "eSocial S-2220",
};

function entityLabel(type: string) {
  return ENTITY_LABELS[type] || type.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function ActionBadge({ action }: { action: string }) {
  const cfg = ACTION_CONFIG[action.toUpperCase()] || { label: action, color: "bg-muted text-muted-foreground", icon: Activity };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function JsonDiff({ before, after }: { before: any; after: any }) {
  const bKeys = Object.keys(before || {});
  const aKeys = Object.keys(after || {});
  const allKeys = Array.from(new Set([...bKeys, ...aKeys]));

  if (allKeys.length === 0) return null;

  return (
    <div className="mt-3 rounded-md border bg-muted/20 p-3 text-xs space-y-1 overflow-auto max-h-60">
      {allKeys.map((key) => {
        const bVal = before?.[key];
        const aVal = after?.[key];
        const changed = JSON.stringify(bVal) !== JSON.stringify(aVal);
        const display = (v: any) => v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

        if (!before || bVal === undefined) {
          return (
            <div key={key} className="flex gap-2">
              <span className="text-muted-foreground w-40 shrink-0 truncate">{key}:</span>
              <span className="text-emerald-600 font-medium">{display(aVal)}</span>
            </div>
          );
        }
        if (!after || aVal === undefined) {
          return (
            <div key={key} className="flex gap-2">
              <span className="text-muted-foreground w-40 shrink-0 truncate">{key}:</span>
              <span className="text-red-600 line-through">{display(bVal)}</span>
            </div>
          );
        }
        if (changed) {
          return (
            <div key={key} className="flex gap-2">
              <span className="text-muted-foreground w-40 shrink-0 truncate">{key}:</span>
              <span className="text-red-500 line-through mr-1">{display(bVal)}</span>
              <ArrowRightLeft className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-emerald-600 font-medium ml-1">{display(aVal)}</span>
            </div>
          );
        }
        return (
          <div key={key} className="flex gap-2 opacity-60">
            <span className="text-muted-foreground w-40 shrink-0 truncate">{key}:</span>
            <span>{display(aVal)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function AuditoriaPage() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [events, setEvents] = useState<AuditEventOut[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async (newOffset = 0) => {
    setLoading(true);
    try {
      const r = await listAuditEvents({
        limit: PAGE_SIZE,
        offset: newOffset,
        q: q || undefined,
        action: action || undefined,
        entity_type: entityType || undefined,
        since: since ? new Date(since).toISOString() : undefined,
        until: until ? new Date(until + "T23:59:59").toISOString() : undefined,
      });
      setEvents(r.items);
      setTotal(r.total);
      setOffset(newOffset);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  }, [q, action, entityType, since, until]);

  useEffect(() => { load(0); }, []);

  function applyFilters() { load(0); }
  function clearFilters() {
    setQ(""); setAction(""); setEntityType(""); setSince(""); setUntil("");
    setTimeout(() => load(0), 0);
  }

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Summary stats from current page
  const actionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.action] = (counts[e.action] || 0) + 1;
    }
    return counts;
  }, [events]);

  // Known entity types from current results
  const knownEntityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.entity_type);
    return Array.from(set).sort();
  }, [events]);

  // Export CSV
  function exportCsv() {
    if (events.length === 0) return;
    const headers = ["Data", "Acao", "Entidade", "Entity ID", "Usuario", "Email", "IP", "Antes", "Depois"];
    const rows = events.map((e) => [
      new Date(e.created_at).toLocaleString("pt-BR"),
      e.action,
      e.entity_type,
      e.entity_id || "",
      e.actor_name || "",
      e.actor_email || "",
      e.ip || "",
      JSON.stringify(e.before_json || {}),
      JSON.stringify(e.after_json || {}),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  }

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Trilha de Auditoria"
        description="Registro completo de acoes para governanca, conformidade NR-1 e investigacoes."
        right={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={events.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Exportar CSV
            </Button>
            <Button variant="secondary" size="sm" onClick={() => load(offset)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        }
      />

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2.5">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-sm text-muted-foreground">Total de eventos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2.5">
                <Plus className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{actionCounts["CREATE"] || 0}</p>
                <p className="text-sm text-muted-foreground">Criacoes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2.5">
                <Pencil className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{actionCounts["UPDATE"] || 0}</p>
                <p className="text-sm text-muted-foreground">Alteracoes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2.5">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{actionCounts["DELETE"] || 0}</p>
                <p className="text-sm text-muted-foreground">Exclusoes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-muted-foreground" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label className="text-xs">Busca</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Texto livre..." />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Acao</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
                <option value="">(Todas)</option>
                <option value="CREATE">Criacao</option>
                <option value="UPDATE">Alteracao</option>
                <option value="DELETE">Exclusao</option>
                <option value="BULK_ENROLL">Matricula em lote</option>
                <option value="LOGIN">Login</option>
                <option value="EXPORT">Exportacao</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Entidade</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                <option value="">(Todas)</option>
                {knownEntityTypes.map((t) => (
                  <option key={t} value={t}>{entityLabel(t)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">De</Label>
              <Input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Ate</Label>
              <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="sm" onClick={applyFilters} disabled={loading}>Aplicar</Button>
            <Button size="sm" variant="outline" onClick={clearFilters}>Limpar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Event list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Eventos
              </CardTitle>
              <CardDescription>
                {loading ? "Carregando..." : `Pagina ${currentPage} de ${totalPages || 1} (${total} eventos)`}
              </CardDescription>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={offset === 0 || loading}
                  onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline" size="sm"
                  disabled={offset + PAGE_SIZE >= total || loading}
                  onClick={() => load(offset + PAGE_SIZE)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 && !loading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nenhum evento encontrado.</p>
            </div>
          ) : (
            events.map((e) => {
              const isExpanded = expandedId === e.id;
              const hasDetail = e.before_json || e.after_json;

              return (
                <div key={e.id} className="rounded-lg border transition-colors hover:bg-muted/30">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => hasDetail && setExpandedId(isExpanded ? null : e.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ActionBadge action={e.action} />
                      <span className="font-medium text-sm">{entityLabel(e.entity_type)}</span>
                      {e.entity_id && (
                        <span className="text-xs text-muted-foreground font-mono">{e.entity_id.slice(0, 8)}</span>
                      )}
                      {(e.actor_name || e.actor_email) && (
                        <span className="text-xs text-muted-foreground hidden sm:inline">
                          por <span className="font-medium text-foreground">{e.actor_name || e.actor_email}</span>
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {e.ip && (
                        <span className="text-xs text-muted-foreground hidden md:inline">{e.ip}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {hasDetail && (
                        isExpanded
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </button>

                  {isExpanded && hasDetail && (
                    <div className="px-4 pb-3 border-t">
                      <div className="pt-2 flex items-center gap-4 text-xs text-muted-foreground mb-2">
                        {(e.actor_name || e.actor_email) && (
                          <span>Usuario: <span className="font-medium">{e.actor_name || "—"}</span>{e.actor_email && ` (${e.actor_email})`}</span>
                        )}
                        {e.request_id && <span>Request: <span className="font-mono">{e.request_id}</span></span>}
                        {e.user_agent && <span className="hidden lg:inline truncate max-w-xs">{e.user_agent.split(" ")[0]}</span>}
                      </div>
                      <JsonDiff before={e.before_json} after={e.after_json} />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Bottom pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline" size="sm"
                disabled={offset === 0 || loading}
                onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground tabular-nums px-3">
                Pagina {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline" size="sm"
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => load(offset + PAGE_SIZE)}
              >
                Proxima <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
