"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import { getSubscription } from "@/lib/api/billing";
import {
  getTenantOverview,
  getReadiness,
  getTrainingSummary,
  type TenantOverviewOut,
  type ReadinessOut,
  type TrainingSummaryOut,
} from "@/lib/api/reports";
import { getLMSStats, type LMSStatsOut } from "@/lib/api/lms";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(n: number, d: number) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}

function fmtDate(s?: string | null) {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const SUB_LABELS: Record<string, { label: string; cls: string }> = {
  active: { label: "ATIVO", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  trial: { label: "TRIAL", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  past_due: { label: "INADIMPLENTE", cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  canceled: { label: "CANCELADO", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  none: { label: "SEM PLANO", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { me, scope } = useConsole();
  const [sub, setSub] = useState<any>(null);
  const [ov, setOv] = useState<TenantOverviewOut | null>(null);
  const [readiness, setReadiness] = useState<ReadinessOut | null>(null);
  const [training, setTraining] = useState<TrainingSummaryOut | null>(null);
  const [lmsStats, setLmsStats] = useState<LMSStatsOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const name = me?.full_name?.split(" ")[0] || "";
    const period = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
    return name ? `${period}, ${name}` : period;
  }, [me?.full_name]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o, r, t, l] = await Promise.all([
        getSubscription().catch(() => null),
        getTenantOverview().catch(() => null),
        getReadiness().catch(() => null),
        getTrainingSummary().catch(() => null),
        getLMSStats().catch(() => null),
      ]);
      setSub(s);
      setOv(o);
      setReadiness(r);
      setTraining(t);
      setLmsStats(l);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar dashboard");
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // ─── Derived ────────────────────────────────────────────────────────────────

  const subStatus = sub?.status || "none";
  const subInfo = SUB_LABELS[subStatus] || SUB_LABELS.none;

  const actionCompletion = useMemo(() => {
    const total = ov?.counts.action_items ?? 0;
    const done = ov?.actions.done ?? 0;
    return { total, done, percent: pct(done, total) };
  }, [ov]);

  const riskTotal = (ov?.risks.low ?? 0) + (ov?.risks.medium ?? 0) + (ov?.risks.high ?? 0);

  const readinessSteps = readiness?.steps ?? [];
  const readinessPct = readiness?.completion_percentage ?? 0;

  const trainingPct = training?.summary?.completion_rate ?? 0;
  const certificatesIssued = training?.summary?.certificates_issued ?? 0;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Visao consolidada do ciclo NR-1: organizacao, diagnostico, risco, plano de acao, treinamento e auditoria
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={subInfo.cls}>{subInfo.label}</Badge>
          <div className="flex flex-col items-end gap-1">
            <Button variant="outline" onClick={refresh} disabled={loading}>
              {loading ? "Carregando..." : "Atualizar"}
            </Button>
            {lastRefresh && (
              <span className="text-[10px] text-muted-foreground">
                Atualizado as {lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ═══════ ROW 1: KPIs Principais ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KpiCard label="CNPJs" value={ov?.counts.cnpjs} color="text-blue-600" />
        <KpiCard label="Unidades" value={ov?.counts.org_units} color="text-indigo-600" />
        <KpiCard label="Colaboradores" value={ov?.counts.employees} color="text-violet-600" />
        <KpiCard label="Campanhas" value={ov?.counts.campaigns} color="text-cyan-600" />
        <KpiCard label="Respostas" value={ov?.counts.responses} color="text-teal-600" />
        <KpiCard label="Avaliacoes de Risco" value={ov?.counts.risk_assessments} color="text-amber-600" />
      </div>

      {/* ═══════ ROW 2: Prontidao NR-1 + Risco ═══════ */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Prontidao NR-1 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Conformidade NR-1</CardTitle>
                <CardDescription>Checklist de prontidao para auditoria</CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-foreground">{readinessPct.toFixed(0)}%</span>
                {readiness?.overall_ready ? (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Pronto</Badge>
                ) : (
                  <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">Pendente</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={readinessPct} className="h-3" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {readinessSteps.length > 0 ? readinessSteps.map((step) => (
                <div key={step.key} className="flex items-start gap-3 rounded-lg bg-muted/40 px-4 py-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
                    step.done
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {step.done ? "✓" : "○"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{step.description}</p>
                  </div>
                </div>
              )) : (
                /* Fallback to overview readiness if /readiness endpoint not available */
                <>
                  <ReadinessItem label="Estrutura organizacional (CNPJ/unidades/colaboradores)" done={!!ov?.readiness.org_structure} />
                  <ReadinessItem label="Diagnostico psicossocial (N >= LGPD)" done={!!ov?.readiness.diagnostic} />
                  <ReadinessItem label="Classificacao de risco por dimensao" done={!!ov?.readiness.risk} />
                  <ReadinessItem label="Plano de acao em execucao" done={!!ov?.readiness.action_plan} />
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Distribuicao de Risco */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Distribuicao de Risco</CardTitle>
            <CardDescription>{riskTotal} avaliacao(oes) realizadas</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RiskBar label="Alto" count={ov?.risks.high ?? 0} total={riskTotal} color="bg-red-500" />
            <RiskBar label="Medio" count={ov?.risks.medium ?? 0} total={riskTotal} color="bg-yellow-500" />
            <RiskBar label="Baixo" count={ov?.risks.low ?? 0} total={riskTotal} color="bg-green-500" />
            {riskTotal === 0 && (
              <p className="text-sm text-muted-foreground text-center py-2">Nenhuma avaliacao de risco registrada</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════ ROW 3: Campanhas + Plano de Acao + Treinamento ═══════ */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Campanhas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Campanhas</CardTitle>
            <CardDescription>Ciclos de diagnostico psicossocial</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <StatusBlock label="Rascunho" value={ov?.campaigns.draft ?? 0} cls="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200" />
              <StatusBlock label="Abertas" value={ov?.campaigns.open ?? 0} cls="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200" />
              <StatusBlock label="Encerradas" value={ov?.campaigns.closed ?? 0} cls="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200" />
            </div>
            <Separator />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total de respostas coletadas</span>
              <span className="font-semibold">{ov?.counts.responses ?? 0}</span>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link className="no-underline" href="/campanhas">Gerenciar Campanhas</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Plano de Acao */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Plano de Acao</CardTitle>
                <CardDescription>Execucao e evidencias NR-1</CardDescription>
              </div>
              <span className="text-2xl font-bold text-foreground">{actionCompletion.percent}%</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={actionCompletion.percent} className="h-3" />
            <div className="grid grid-cols-3 gap-3">
              <StatusBlock label="Planejado" value={ov?.actions.planned ?? 0} cls="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200" />
              <StatusBlock label="Em Andamento" value={ov?.actions.in_progress ?? 0} cls="bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200" />
              <StatusBlock label="Concluido" value={ov?.actions.done ?? 0} cls="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200" />
            </div>
            <Separator />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total de itens</span>
              <span className="font-semibold">{actionCompletion.total}</span>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link className="no-underline" href="/plano-de-acao">Gerenciar Plano de Acao</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Treinamento */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Treinamento (LMS)</CardTitle>
                <CardDescription>Capacitacao e conformidade</CardDescription>
              </div>
              <span className="text-2xl font-bold text-foreground">{trainingPct.toFixed(0)}%</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={trainingPct} className="h-3" />
            <div className="grid grid-cols-2 gap-3">
              <StatusBlock label="Matriculas" value={training?.summary?.total_enrollments ?? 0} cls="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200" />
              <StatusBlock label="Concluidas" value={training?.summary?.completed ?? 0} cls="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200" />
              <StatusBlock label="Pendentes" value={training?.summary?.pending ?? 0} cls="bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-200" />
              <StatusBlock label="Certificados" value={certificatesIssued} cls="bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-200" />
            </div>
            <Separator />
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Conteudos na biblioteca</span>
              <span className="font-semibold">{lmsStats?.total_contents ?? training?.summary?.total_educational_items ?? 0}</span>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link className="no-underline" href="/lms">Gerenciar LMS</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ ROW 4: Acoes Rapidas + Auditoria + Info ═══════ */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Acoes Rapidas */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Acoes Rapidas</CardTitle>
            <CardDescription>Proximos passos recomendados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <QuickAction href="/campanhas" label="Criar/gerenciar campanhas" desc="Inicie diagnosticos psicossociais" primary />
            <QuickAction href="/questionarios" label="Questionarios" desc="Templates e versionamento NR-1" />
            <QuickAction href="/resultados" label="Visualizar resultados" desc="Agregacao com conformidade LGPD" />
            <QuickAction href="/mapa-de-risco" label="Mapa de Risco" desc="Classificacao por dimensao e setor" />
            <QuickAction href="/relatorios" label="Gerar Dossie PGR/PDF" desc="Relatorio completo para auditoria" />
            <QuickAction href="/colaboradores" label="Colaboradores" desc="Gestao de pessoal e vinculos" />
            <QuickAction href="/lms" label="Gerenciar treinamentos" desc="Conteudos, trilhas e atribuicoes" />
            <QuickAction href="/organograma" label="Organograma" desc="CNPJs, unidades e hierarquia" />
            <QuickAction href="/esocial" label="eSocial" desc="Eventos SST S-2210, S-2220, S-2240" />
            <QuickAction href="/auditoria" label="Trilha de auditoria" desc="Log completo (retencao 20 anos)" />
          </CardContent>
        </Card>

        {/* Auditoria */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Auditoria e Governanca</CardTitle>
            <CardDescription>Rastreabilidade e conformidade</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Ultimo evento</span>
                <span className="font-medium text-foreground">{fmtDate(ov?.audit.last_event_at)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Threshold LGPD</span>
                <span className="font-medium text-foreground">{ov?.lgpd?.min_anon_threshold ?? "-"} respostas</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Retencao legal</span>
                <span className="font-medium text-foreground">20 anos</span>
              </div>
            </div>
            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>Todos os eventos sao registrados com IP, request_id e actor_user_id para conformidade com a Lei Geral de Protecao de Dados (LGPD).</p>
              <p>A agregacao de respostas respeita o threshold minimo de anonimizacao configurado pelo tenant.</p>
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link className="no-underline" href="/auditoria">Acessar Trilha de Auditoria</Link>
            </Button>
          </CardContent>
        </Card>

        {/* Informacoes do Tenant */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Informacoes da Conta</CardTitle>
            <CardDescription>Dados da organizacao e plano</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <InfoRow label="Usuario" value={me?.full_name || me?.email || "-"} />
              <InfoRow label="Tenant" value={me?.tenant?.name || "-"} />
              <InfoRow label="Plano" value={<Badge className={subInfo.cls}>{subInfo.label}</Badge>} />
              {sub?.current_period_end && (
                <InfoRow label="Vigencia ate" value={fmtDate(sub.current_period_end)} />
              )}
              <InfoRow label="Escopo" value={
                scope.cnpjId
                  ? `CNPJ selecionado${scope.orgUnitId ? " + Unidade" : ""}`
                  : "Todos os CNPJs"
              } />
              <InfoRow label="Gerado em" value={fmtDate(ov?.generated_at)} />
            </div>
            <Separator />
            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link className="no-underline" href="/assinatura">Assinatura</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link className="no-underline" href="/configuracoes">Configuracoes</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function KpiCard({ label, value, color }: { label: string; value?: number | null; color: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p>
        <p className={`text-3xl font-bold mt-1 ${color}`}>{value ?? "-"}</p>
      </CardContent>
    </Card>
  );
}

function RiskBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pctVal = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{count} ({pctVal}%)</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted">
        <div className={`h-2.5 rounded-full ${color} transition-all`} style={{ width: `${pctVal}%` }} />
      </div>
    </div>
  );
}

function StatusBlock({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 text-center ${cls}`}>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-[11px] font-medium mt-0.5">{label}</p>
    </div>
  );
}

function ReadinessItem({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-lg bg-muted/40 px-4 py-3">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-sm font-bold ${
        done
          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
          : "bg-muted text-muted-foreground"
      }`}>
        {done ? "✓" : "○"}
      </div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

function QuickAction({ href, label, desc, primary }: { href: string; label: string; desc: string; primary?: boolean }) {
  return (
    <Link href={href} className="no-underline block">
      <div className={`rounded-lg px-4 py-3 transition-colors ${
        primary
          ? "bg-primary/10 hover:bg-primary/15 border border-primary/20"
          : "bg-muted/40 hover:bg-muted/60"
      }`}>
        <p className={`text-sm font-medium ${primary ? "text-primary" : "text-foreground"}`}>{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </Link>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
