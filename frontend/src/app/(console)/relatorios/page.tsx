"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import { getPgrDossier, type PgrDossierOut } from "@/lib/api/reports";
import { listCampaigns } from "@/lib/api/campaigns";
import type { CampaignDetailOut } from "@/lib/api/types";

function RiskBadge({ level }: { level: string }) {
  const v = String(level).toLowerCase();
  if (v === "high") return <Badge variant="destructive">ALTO</Badge>;
  if (v === "medium") return <Badge variant="secondary">MÉDIO</Badge>;
  return <Badge variant="default">BAIXO</Badge>;
}

export default function RelatoriosPage() {
  const { scope } = useConsole();
  const [campaigns, setCampaigns] = useState<CampaignDetailOut[]>([]);
  const [campaignId, setCampaignId] = useState<string>("");
  const [data, setData] = useState<PgrDossierOut | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadCampaigns() {
    try {
      const r = await listCampaigns({ limit: 200, offset: 0, cnpj_id: scope.cnpjId || undefined });
      setCampaigns(r.items);
      if (!campaignId && r.items[0]?.id) setCampaignId(r.items[0].id);
    } catch {
      setCampaigns([]);
    }
  }

  async function generate() {
    setLoading(true);
    try {
      const r = await getPgrDossier({ cnpj_id: scope.cnpjId || undefined, campaign_id: campaignId || undefined, limit_audit: 200 });
      setData(r);
      toast.success("Dossiê gerado");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar dossiê");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.cnpjId]);

  const campaignOptions = useMemo(() => campaigns.map((c) => ({ id: c.id, label: `${c.name} • ${c.status}` })), [campaigns]);

  const riskByLevel = useMemo(() => {
    const out = { high: 0, medium: 0, low: 0 };
    for (const r of data?.risks || []) {
      const k = String(r.level).toLowerCase();
      // @ts-ignore
      if (out[k] !== undefined) out[k] += 1;
    }
    return out;
  }, [data]);

  const actionStats = useMemo(() => {
    let planned = 0, in_progress = 0, done = 0;
    for (const p of data?.action_plans || []) {
      for (const i of p.items || []) {
        const st = String(i.status);
        if (st === "done") done += 1;
        else if (st === "in_progress") in_progress += 1;
        else planned += 1;
      }
    }
    return { planned, in_progress, done, total: planned + in_progress + done };
  }, [data]);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Relatórios (Dossiê)"
        description="Gere um dossiê estruturado para auditoria interna/externa. Você pode imprimir em PDF (Ctrl/Cmd+P)."
        right={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadCampaigns}>
              Atualizar campanhas
            </Button>
            <Button onClick={generate} disabled={loading || !scope.cnpjId}>
              Gerar dossiê
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              Imprimir / PDF
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Parâmetros</CardTitle>
          <CardDescription>O dossiê é sempre no escopo do tenant. Recomenda-se selecionar um CNPJ no topo.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">CNPJ selecionado</div>
            <div className="flex items-center gap-2">
              <Badge variant={scope.cnpjId ? "default" : "outline"}>{scope.cnpjId ? "OK" : "Selecione no topo"}</Badge>
              <div className="text-sm text-muted-foreground">LGPD: mínimo N={data?.lgpd.min_anon_threshold ?? "—"}</div>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Filtrar por campanha (opcional)</div>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">(Todas)
              </option>
              {campaignOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {!data ? (
        <div className="rounded-xl border bg-muted/20 p-6 text-sm text-muted-foreground">
          Gere o dossiê para ver a versão imprimível. Ele consolida campanhas, avaliações de risco, planos de ação, evidências e trilha de auditoria.
        </div>
      ) : (
        <div className="space-y-6" id="dossie">
          <Card>
            <CardHeader>
              <CardTitle>Dossiê PGR (visão executiva)</CardTitle>
              <CardDescription>Gerado em {new Date(data.generated_at).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Campanhas</div>
                <div className="text-2xl font-semibold">{data.campaigns.length}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Riscos</div>
                <div className="text-2xl font-semibold">{data.risks.length}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Ações</div>
                <div className="text-2xl font-semibold">{actionStats.total}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Eventos auditoria</div>
                <div className="text-2xl font-semibold">{data.audit.length}</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Risco (distribuição)</CardTitle>
                <CardDescription>Snapshot das avaliações disponíveis no escopo.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Alto</div>
                  <div className="text-2xl font-semibold">{riskByLevel.high}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Médio</div>
                  <div className="text-2xl font-semibold">{riskByLevel.medium}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Baixo</div>
                  <div className="text-2xl font-semibold">{riskByLevel.low}</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Plano de ação (status)</CardTitle>
                <CardDescription>Andamento dos itens vinculados às avaliações.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Planejado</div>
                  <div className="text-2xl font-semibold">{actionStats.planned}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Em execução</div>
                  <div className="text-2xl font-semibold">{actionStats.in_progress}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Concluído</div>
                  <div className="text-2xl font-semibold">{actionStats.done}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Campanhas</CardTitle>
              <CardDescription>Inclui o indicador de liberação de agregação (LGPD).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {data.campaigns.map((c) => (
                <div key={c.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Status: {c.status} • Respostas: {c.responses} • Agregação: {c.aggregation_allowed ? "liberada" : "bloqueada"}
                      </div>
                    </div>
                    <Badge variant={c.aggregation_allowed ? "default" : "outline"}>{c.aggregation_allowed ? "OK" : "LGPD"}</Badge>
                  </div>
                </div>
              ))}
              {data.campaigns.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma campanha no escopo.</div> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Avaliações de risco</CardTitle>
              <CardDescription>Use como base para priorização de ações e evidências.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {data.risks.map((r) => (
                <div key={r.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium">Campanha: {r.campaign_id}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.assessed_at).toLocaleString()} • score {r.score.toFixed(2)}</div>
                    </div>
                    <RiskBadge level={r.level} />
                  </div>
                </div>
              ))}
              {data.risks.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum risco classificado no escopo.</div> : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
