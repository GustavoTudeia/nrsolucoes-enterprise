"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import { getSubscription } from "@/lib/api/billing";
import { getTenantOverview, type TenantOverviewOut } from "@/lib/api/reports";

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className="h-2 rounded-full bg-primary" style={{ width: `${v}%` }} />
    </div>
  );
}

function ReadinessBadge({ ok }: { ok: boolean }) {
  return <Badge variant={ok ? "default" : "outline"}>{ok ? "OK" : "Pendente"}</Badge>;
}

export default function DashboardPage() {
  const { me, scope } = useConsole();
  const [sub, setSub] = useState<any>(null);
  const [ov, setOv] = useState<TenantOverviewOut | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([getSubscription(), getTenantOverview()]);
      setSub(s);
      setOv(o);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusBadge = useMemo(() => {
    const st = sub?.status || "none";
    const v = st === "active" ? "default" : st === "trial" ? "secondary" : "outline";
    return <Badge variant={v as any}>{String(st).toUpperCase()}</Badge>;
  }, [sub]);

  const actionCompletion = useMemo(() => {
    const total = ov?.counts.action_items ?? 0;
    const done = ov?.actions.done ?? 0;
    return { total, done, percent: pct(done, total) };
  }, [ov]);

  const riskTotal = (ov?.risks.low ?? 0) + (ov?.risks.medium ?? 0) + (ov?.risks.high ?? 0);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Painel"
        description="Visão executiva do ciclo NR-1 (GRO/PGR): organização → diagnóstico → risco → plano de ação → evidências."
        right={
          <div className="flex items-center gap-2">
            {statusBadge}
            <Button variant="secondary" onClick={refresh} disabled={loading}>
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>CNPJs</CardTitle>
            <CardDescription>Estrutura ativa</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{ov?.counts.cnpjs ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unidades/Setores</CardTitle>
            <CardDescription>Segmentação</CardDescription>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{ov?.counts.org_units ?? "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Campanhas</CardTitle>
            <CardDescription>Draft / Abertas / Encerradas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Draft</span>
              <span className="font-medium">{ov?.campaigns.draft ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Abertas</span>
              <span className="font-medium">{ov?.campaigns.open ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Encerradas</span>
              <span className="font-medium">{ov?.campaigns.closed ?? "—"}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Plano de ação</CardTitle>
            <CardDescription>Execução + evidências</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-3xl font-semibold">{actionCompletion.percent}%</div>
              <div className="text-xs text-muted-foreground">
                {actionCompletion.done}/{actionCompletion.total} concluídos
              </div>
            </div>
            <ProgressBar value={actionCompletion.percent} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Risco (snapshot)</CardTitle>
            <CardDescription>Distribuição por nível</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Baixo</div>
                <div className="text-2xl font-semibold">{ov?.risks.low ?? 0}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Médio</div>
                <div className="text-2xl font-semibold">{ov?.risks.medium ?? 0}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Alto</div>
                <div className="text-2xl font-semibold">{ov?.risks.high ?? 0}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Total: <span className="font-medium text-foreground">{riskTotal}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prontidão (heurística)</CardTitle>
            <CardDescription>Checklist operacional para auditoria interna</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Estrutura (CNPJ/unidade/colabs)</span>
              <ReadinessBadge ok={!!ov?.readiness.org_structure} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Diagnóstico (N≥LGPD)</span>
              <ReadinessBadge ok={!!ov?.readiness.diagnostic} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Classificação de risco</span>
              <ReadinessBadge ok={!!ov?.readiness.risk} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Plano de ação em execução</span>
              <ReadinessBadge ok={!!ov?.readiness.action_plan} />
            </div>
            <div className="pt-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Geral</span>
                <ReadinessBadge ok={!!ov?.readiness.overall} />
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Esta heurística ajuda a guiar a operação e a organização de evidências; não substitui validação técnica/jurídica.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações rápidas</CardTitle>
            <CardDescription>Próximos passos recomendados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Escopo atual: {scope.cnpjId ? "CNPJ selecionado" : "(Selecione um CNPJ)"}
              {scope.orgUnitId ? " • Setor/Unidade" : ""}
            </div>
            <div className="flex flex-col gap-2">
              <Button asChild>
                <Link className="no-underline" href="/campanhas">
                  Criar/gerenciar campanhas
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link className="no-underline" href="/resultados">
                  Ver resultados (LGPD)
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link className="no-underline" href="/relatorios">
                  Gerar dossiê (print/PDF)
                </Link>
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Último evento de auditoria: {ov?.audit.last_event_at ? new Date(ov.audit.last_event_at).toLocaleString() : "—"}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
