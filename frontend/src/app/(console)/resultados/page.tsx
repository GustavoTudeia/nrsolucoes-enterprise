"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { aggregateCampaign, aggregateByOrgUnit, getCampaignStats, listCampaigns } from "@/lib/api/campaigns";
import { listUnits } from "@/lib/api/org";
import { useConsole } from "@/components/console/console-provider";
import type { CampaignDetailOut, CampaignAggregateOut, CampaignAggregateByOrgUnitOut, OrgUnitOut } from "@/lib/api/types";

function levelFromScore(score01: number) {
  // Heurística visual (não é a mesma regra do critério versionado).
  if (score01 >= 0.7) return { label: "Crítico", variant: "destructive" as const };
  if (score01 >= 0.45) return { label: "Atenção", variant: "secondary" as const };
  return { label: "OK", variant: "default" as const };
}

function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value * 100)));
  const meta = levelFromScore(value);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{v}%</span>
        <Badge variant={meta.variant}>{meta.label}</Badge>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export default function ResultadosPage() {
  const { scope } = useConsole();

  const [campaigns, setCampaigns] = useState<CampaignDetailOut[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [stats, setStats] = useState<{ responses: number; min_anon_threshold: number; aggregation_allowed: boolean } | null>(null);
  const [agg, setAgg] = useState<CampaignAggregateOut | null>(null);
  const [aggByUnit, setAggByUnit] = useState<CampaignAggregateByOrgUnitOut | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitOut[]>([]);

  const unitName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of orgUnits) map[u.id] = u.name;
    return map;
  }, [orgUnits]);

  async function loadCampaigns() {
    try {
      const r = await listCampaigns({ limit: 200, offset: 0, cnpj_id: scope.cnpjId || undefined });
      setCampaigns(r.items);
      if (!campaignId && r.items[0]?.id) setCampaignId(r.items[0].id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar campanhas");
    }
  }

  async function loadScopeUnits() {
    try {
      if (!scope.cnpjId) {
        setOrgUnits([]);
        return;
      }
      const u = await listUnits(scope.cnpjId);
      setOrgUnits(u);
    } catch {
      setOrgUnits([]);
    }
  }

  async function refreshData(selectedId: string) {
    if (!selectedId) return;
    try {
      const st = await getCampaignStats(selectedId);
      setStats({ responses: st.responses, min_anon_threshold: st.min_anon_threshold, aggregation_allowed: st.aggregation_allowed });
    } catch {
      setStats(null);
    }

    // Agregações: respeitam LGPD
    try {
      const r = await aggregateCampaign(selectedId);
      setAgg(r);
    } catch (e: any) {
      setAgg(null);
    }

    try {
      const r2 = await aggregateByOrgUnit(selectedId);
      setAggByUnit(r2);
    } catch {
      setAggByUnit(null);
    }
  }

  useEffect(() => {
    loadCampaigns();
    loadScopeUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.cnpjId]);

  useEffect(() => {
    if (campaignId) refreshData(campaignId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const campaignOptions = useMemo(() => campaigns.map((c) => ({ id: c.id, label: `${c.name} • ${c.status}` })), [campaigns]);

  const dimRows = useMemo(() => {
    const ds = agg?.dimension_scores || {};
    return Object.entries(ds)
      .map(([k, v]) => ({ key: k, score: Number(v) }))
      .sort((a, b) => b.score - a.score);
  }, [agg]);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader title="Resultados (M2)" description="Painéis agregados (k-anonimato): sem PII, com visão por setor/unidade." />

      <Card>
        <CardHeader>
          <CardTitle>Selecionar campanha</CardTitle>
          <CardDescription>
            Selecione uma campanha. A agregação só é liberada quando a campanha atinge o mínimo de respostas (LGPD).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2 md:col-span-2">
            <div className="text-xs text-muted-foreground">Campanha</div>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Selecione</option>
              {campaignOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button variant="secondary" onClick={loadCampaigns}>
              Atualizar
            </Button>
            <Button onClick={() => campaignId && refreshData(campaignId)} disabled={!campaignId}>
              Recalcular
            </Button>
          </div>

          <div className="md:col-span-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Respostas</div>
              <div className="text-2xl font-semibold">{stats?.responses ?? "—"}</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Mínimo LGPD</div>
              <div className="text-2xl font-semibold">{stats?.min_anon_threshold ?? "—"}</div>
            </div>
            <div className="rounded-lg border p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Agregação</div>
                <div className="text-sm font-medium">{stats?.aggregation_allowed ? "Liberada" : "Bloqueada"}</div>
              </div>
              <Badge variant={stats?.aggregation_allowed ? "default" : "outline"}>{stats?.aggregation_allowed ? "OK" : "LGPD"}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Painel geral (dimensões)</CardTitle>
            <CardDescription>Média normalizada (0..1) por dimensão.</CardDescription>
          </CardHeader>
          <CardContent>
            {agg ? (
              <div className="space-y-4">
                {dimRows.map((d) => (
                  <div key={d.key} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{d.key}</div>
                      <div className="text-xs text-muted-foreground">score: {d.score.toFixed(2)}</div>
                    </div>
                    <div className="mt-3">
                      <Bar value={d.score} />
                    </div>
                  </div>
                ))}
                {dimRows.length === 0 ? <div className="text-sm text-muted-foreground">Sem dimensões no agregado.</div> : null}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {stats?.aggregation_allowed === false
                  ? `Agregação bloqueada (LGPD): mínimo de ${stats?.min_anon_threshold ?? "N"} respostas.`
                  : "Nenhum agregado disponível."
                }
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por setor/unidade</CardTitle>
            <CardDescription>Grupos com N &ge; mínimo (LGPD). Grupos abaixo do limiar aparecem como bloqueados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {aggByUnit ? (
              <>
                <div className="text-xs text-muted-foreground">Mínimo LGPD: {aggByUnit.min_anon_threshold}</div>
                <div className="space-y-3">
                  {aggByUnit.groups.map((g) => {
                    const name = g.org_unit_id ? (unitName[g.org_unit_id] || g.org_unit_id) : "(Sem setor)";
                    const topDim = Object.entries(g.dimension_scores || {}).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
                    return (
                      <div key={String(g.org_unit_id)} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{name}</div>
                            <div className="text-xs text-muted-foreground">N={g.n}</div>
                          </div>
                          <Badge variant="secondary">{topDim ? `Pior: ${topDim[0]}` : "—"}</Badge>
                        </div>
                        {topDim ? (
                          <div className="mt-3">
                            <div className="text-xs text-muted-foreground">{topDim[0]} • {Number(topDim[1]).toFixed(2)}</div>
                            <Bar value={Number(topDim[1])} />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {aggByUnit.groups.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum grupo liberado ainda.</div> : null}
                </div>

                {aggByUnit.blocked_groups.length > 0 ? (
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="font-medium">Grupos bloqueados (LGPD)</div>
                    <div className="mt-2 grid gap-2">
                      {aggByUnit.blocked_groups.map((b) => (
                        <div key={String(b.org_unit_id)} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            {b.org_unit_id ? (unitName[b.org_unit_id] || b.org_unit_id) : "(Sem setor)"}
                          </span>
                          <Badge variant="outline">N={b.n}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">Nenhum agregado por unidade disponível.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
