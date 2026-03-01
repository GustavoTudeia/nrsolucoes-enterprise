"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { listAuditEvents, type AuditEventOut } from "@/lib/api/audit";

function ActionBadge({ action }: { action: string }) {
  const a = String(action).toUpperCase();
  if (a === "DELETE") return <Badge variant="destructive">{a}</Badge>;
  if (a === "UPDATE") return <Badge variant="secondary">{a}</Badge>;
  if (a === "CREATE") return <Badge variant="default">{a}</Badge>;
  return <Badge variant="outline">{a}</Badge>;
}

export default function AuditoriaPage() {
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("");
  const [entityType, setEntityType] = useState<string>("");
  const [events, setEvents] = useState<AuditEventOut[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  async function load() {
    setLoading(true);
    try {
      const r = await listAuditEvents({
        limit: 100,
        offset: 0,
        q: q || undefined,
        action: action || undefined,
        entity_type: entityType || undefined,
      });
      setEvents(r.items);
      setTotal(r.total);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar auditoria");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entityTypes = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.entity_type);
    return Array.from(set).sort();
  }, [events]);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Auditoria"
        description="Trilha de auditoria (eventos) para governança enterprise: criação/alteração de campanhas, riscos, planos e evidências."
        right={
          <Button variant="secondary" onClick={load} disabled={loading}>
            Atualizar
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Use para investigações, conformidade e validação de processos (sem expor PII).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Busca (entity_type / request_id)</div>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex: CAMPAIGN, ACTION_ITEM, request_id..." />
          </div>
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Ação</div>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">(Todas)</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="EXPORT">EXPORT</option>
              <option value="LOGIN">LOGIN</option>
            </select>
          </div>
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Entidade</div>
            <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="Ex: CAMPAIGN, ACTION_ITEM..." />
            {entityTypes.length > 0 ? (
              <div className="text-[11px] text-muted-foreground">Sugestões: {entityTypes.slice(0, 6).join(", ")}{entityTypes.length > 6 ? "..." : ""}</div>
            ) : null}
          </div>
          <div className="md:col-span-3 flex gap-2">
            <Button onClick={load} disabled={loading}>Aplicar</Button>
            <Button
              variant="outline"
              onClick={() => {
                setQ("");
                setAction("");
                setEntityType("");
                setTimeout(load, 0);
              }}
            >
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eventos</CardTitle>
          <CardDescription>{loading ? "Carregando..." : `${events.length} exibidos • ${total} no total (página atual).`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ActionBadge action={e.action} />
                    <div className="font-medium">{e.entity_type}</div>
                    {e.entity_id ? <Badge variant="outline">{e.entity_id.slice(0, 8)}…</Badge> : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()} • actor: {e.actor_user_id ? e.actor_user_id.slice(0, 8) + "…" : "—"}
                    {e.ip ? ` • ip: ${e.ip}` : ""}
                    {e.request_id ? ` • req: ${e.request_id}` : ""}
                  </div>
                </div>
              </div>

              {(e.before_json || e.after_json) ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm text-muted-foreground">Detalhes (before/after)</summary>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <pre className="text-xs rounded-md border bg-muted/20 p-3 overflow-auto">{JSON.stringify(e.before_json || {}, null, 2)}</pre>
                    <pre className="text-xs rounded-md border bg-muted/20 p-3 overflow-auto">{JSON.stringify(e.after_json || {}, null, 2)}</pre>
                  </div>
                </details>
              ) : null}
            </div>
          ))}
          {events.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum evento encontrado.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
