"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import {
  getPgrDossier,
  getReadiness,
  getTrainingSummary,
  downloadPgrDossierPdf,
  type PgrDossierOut,
  type ReadinessOut,
  type TrainingSummaryOut,
} from "@/lib/api/reports";
import { listCampaigns } from "@/lib/api/campaigns";
import type { CampaignDetailOut } from "@/lib/api/types";
import {
  FileText, Download, RefreshCw, CheckCircle2, Circle, AlertTriangle,
  Shield, BarChart3, Users, Award, ClipboardList, Building2,
  TrendingUp, Clock, FileCheck, ChevronRight, Loader2,
  GraduationCap, Activity, Eye, Printer,
} from "lucide-react";

// ==================== Helpers ====================

const RISK_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-red-100 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", label: "Alto" },
  medium: { bg: "bg-amber-100 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", label: "Médio" },
  low: { bg: "bg-green-100 dark:bg-green-950/40", text: "text-green-700 dark:text-green-400", label: "Baixo" },
};

const ACTION_STATUS: Record<string, { label: string; color: string }> = {
  planned: { label: "Planejado", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  in_progress: { label: "Em Execução", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" },
  done: { label: "Concluído", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  blocked: { label: "Bloqueado", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" },
  cancelled: { label: "Cancelado", color: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

const DIMENSION_LABELS: Record<string, string> = {
  governance: "Governança",
  hazards: "Perigos e Riscos",
  controls: "Controles",
  training: "Capacitação",
  psychosocial: "Psicossocial",
  organizational: "Organizacional",
  interpersonal: "Interpessoal",
  workload: "Carga de Trabalho",
  autonomy: "Autonomia",
  support: "Suporte",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

// ==================== Sub-Components ====================

function MetricCard({ icon: Icon, label, value, sub, className = "" }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground truncate">{label}</div>
          <div className="text-2xl font-bold tracking-tight">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: string }) {
  const cfg = RISK_COLORS[level?.toLowerCase()] || RISK_COLORS.low;
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>;
}

function ReadinessChecklist({ data }: { data: ReadinessOut }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-5 w-5 text-primary" />
            Checklist de Conformidade NR-1
          </CardTitle>
          <Badge variant={data.overall_ready ? "default" : "outline"}>
            {data.done}/{data.total}
          </Badge>
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Progress value={data.completion_percentage} className="h-2 flex-1" />
          <span className="text-sm font-medium">{data.completion_percentage}%</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {data.steps.map((step) => (
            <div key={step.key} className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${step.done ? "bg-green-50/50 dark:bg-green-950/10 border-green-200 dark:border-green-900" : "bg-muted/30"}`}>
              {step.done ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${step.done ? "text-green-700 dark:text-green-300" : ""}`}>{step.label}</div>
                <div className="text-xs text-muted-foreground">{step.description}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DimensionBar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  const color = w > 70 ? "bg-red-500" : w > 40 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-muted-foreground truncate" title={label}>{label}</div>
      <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(w, 100)}%` }} />
      </div>
      <div className="w-12 text-right text-xs font-medium">{(value * 100).toFixed(0)}%</div>
    </div>
  );
}

// ==================== Main Page ====================

export default function RelatoriosPage() {
  const { scope } = useConsole();

  // Data states
  const [campaigns, setCampaigns] = useState<CampaignDetailOut[]>([]);
  const [campaignId, setCampaignId] = useState<string>("__all__");
  const [data, setData] = useState<PgrDossierOut | null>(null);
  const [readiness, setReadiness] = useState<ReadinessOut | null>(null);
  const [training, setTraining] = useState<TrainingSummaryOut | null>(null);

  // UI states
  const [loading, setLoading] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [tab, setTab] = useState("overview");
  const [auditPage, setAuditPage] = useState(0);
  const AUDIT_PAGE_SIZE = 20;

  // Load campaigns
  const loadCampaigns = useCallback(async () => {
    try {
      const r = await listCampaigns({ limit: 200, offset: 0, cnpj_id: scope.cnpjId || undefined });
      setCampaigns(r.items);
    } catch {
      setCampaigns([]);
    }
  }, [scope.cnpjId]);

  // Load readiness on mount
  useEffect(() => {
    getReadiness().then(setReadiness).catch(() => {});
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Generate full report
  async function generate() {
    setLoading(true);
    try {
      const params = {
        cnpj_id: scope.cnpjId || undefined,
        campaign_id: campaignId !== "__all__" ? campaignId : undefined,
        limit_audit: 500,
      };
      const [dossier, trainingSummary] = await Promise.all([
        getPgrDossier(params),
        getTrainingSummary({ cnpj_id: scope.cnpjId || undefined }),
      ]);
      setData(dossier);
      setTraining(trainingSummary);
      setAuditPage(0);
      // Refresh readiness
      getReadiness().then(setReadiness).catch(() => {});
      toast.success("Relatório gerado com sucesso");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar relatório");
    } finally {
      setLoading(false);
    }
  }

  // PDF export
  async function handlePdfExport() {
    setLoadingPdf(true);
    try {
      const blob = await downloadPgrDossierPdf({
        cnpj_id: scope.cnpjId || undefined,
        campaign_id: campaignId !== "__all__" ? campaignId : undefined,
        limit_audit: 500,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dossie_pgr_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF exportado");
    } catch {
      toast.error("Erro ao exportar PDF. Verifique se o backend tem reportlab instalado.");
    } finally {
      setLoadingPdf(false);
    }
  }

  // Computed data
  const riskByLevel = useMemo(() => {
    const out = { high: 0, medium: 0, low: 0, total: 0 };
    for (const r of data?.risks || []) {
      const k = String(r.level).toLowerCase() as keyof typeof out;
      if (k in out) out[k] += 1;
      out.total += 1;
    }
    return out;
  }, [data]);

  const actionStats = useMemo(() => {
    const out = { planned: 0, in_progress: 0, done: 0, blocked: 0, cancelled: 0, total: 0 };
    for (const p of data?.action_plans || []) {
      for (const i of p.items || []) {
        const st = String(i.status) as keyof typeof out;
        if (st in out) out[st] += 1;
        out.total += 1;
      }
    }
    return out;
  }, [data]);

  const evidenceCount = useMemo(() => {
    let count = 0;
    for (const p of data?.action_plans || []) {
      for (const i of p.items || []) {
        count += (i.evidences || []).length;
      }
    }
    return count;
  }, [data]);

  const dimensionScores = useMemo(() => {
    if (!data?.risks?.length) return [];
    const agg: Record<string, { sum: number; count: number }> = {};
    for (const r of data.risks) {
      for (const [dim, score] of Object.entries(r.dimension_scores || {})) {
        if (!agg[dim]) agg[dim] = { sum: 0, count: 0 };
        agg[dim].sum += Number(score);
        agg[dim].count += 1;
      }
    }
    return Object.entries(agg)
      .map(([dim, { sum, count }]) => ({ dim, label: DIMENSION_LABELS[dim] || dim, avg: sum / count }))
      .sort((a, b) => b.avg - a.avg);
  }, [data]);

  const maxDimScore = useMemo(() => Math.max(...dimensionScores.map(d => d.avg), 0.01), [dimensionScores]);

  const pagedAudit = useMemo(() => {
    const all = data?.audit || [];
    const start = auditPage * AUDIT_PAGE_SIZE;
    return { items: all.slice(start, start + AUDIT_PAGE_SIZE), total: all.length, pages: Math.ceil(all.length / AUDIT_PAGE_SIZE) };
  }, [data, auditPage]);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Relatórios & Dossiê PGR"
        description="Dashboard de conformidade NR-1 com exportação de dossiê para auditoria."
        right={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={loadCampaigns}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
            <Button size="sm" onClick={generate} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <BarChart3 className="h-4 w-4 mr-1" />}
              Gerar Relatório
            </Button>
            <Button variant="outline" size="sm" onClick={handlePdfExport} disabled={loadingPdf || !data}>
              {loadingPdf ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              Exportar PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={() => window.print()} disabled={!data}>
              <Printer className="h-4 w-4 mr-1" /> Imprimir
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">CNPJ</div>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{scope.cnpjId ? "Selecionado" : "Selecione um CNPJ no topo"}</span>
                <Badge variant={scope.cnpjId ? "default" : "outline"} className="text-xs">
                  {scope.cnpjId ? "OK" : "Pendente"}
                </Badge>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Campanha</div>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as campanhas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas as campanhas</SelectItem>
                  {campaigns.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">LGPD</div>
              <div className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-muted-foreground" />
                Limite k-anonimidade: <strong>{data?.lgpd?.min_anon_threshold ?? 5}</strong>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Readiness Checklist - always visible */}
      {readiness && <ReadinessChecklist data={readiness} />}

      {/* No data state */}
      {!data && !loading && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">Nenhum relatório gerado</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Clique em "Gerar Relatório" para consolidar campanhas, avaliações de risco,
              planos de ação, treinamentos, certificados e trilha de auditoria.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
            <span className="text-muted-foreground">Gerando relatório completo...</span>
          </CardContent>
        </Card>
      )}

      {/* Report Content */}
      {data && !loading && (
        <div className="space-y-6">
          {/* Executive Metrics */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
            <MetricCard icon={ClipboardList} label="Campanhas" value={data.campaigns.length} />
            <MetricCard icon={AlertTriangle} label="Riscos Avaliados" value={riskByLevel.total}
              sub={riskByLevel.high > 0 ? `${riskByLevel.high} alto(s)` : undefined} />
            <MetricCard icon={Activity} label="Itens de Ação" value={actionStats.total}
              sub={`${pct(actionStats.done, actionStats.total)}% concluído`} />
            <MetricCard icon={FileCheck} label="Evidências" value={evidenceCount} />
            <MetricCard icon={GraduationCap} label="Treinamentos" value={training?.summary?.total_enrollments ?? 0}
              sub={training ? `${training.summary.completion_rate.toFixed(0)}% concluído` : undefined} />
            <MetricCard icon={Award} label="Certificados" value={training?.summary?.certificates_issued ?? 0} />
          </div>

          {/* Tabs */}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="overview" className="gap-1"><BarChart3 className="h-3.5 w-3.5" /> Visão Geral</TabsTrigger>
              <TabsTrigger value="risks" className="gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Riscos</TabsTrigger>
              <TabsTrigger value="actions" className="gap-1"><ClipboardList className="h-3.5 w-3.5" /> Plano de Ação</TabsTrigger>
              <TabsTrigger value="training" className="gap-1"><GraduationCap className="h-3.5 w-3.5" /> Treinamentos</TabsTrigger>
              <TabsTrigger value="audit" className="gap-1"><Eye className="h-3.5 w-3.5" /> Auditoria</TabsTrigger>
            </TabsList>

            {/* ===================== TAB: Overview ===================== */}
            <TabsContent value="overview" className="space-y-6 mt-4">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Risk Distribution */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Distribuição de Riscos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(["high", "medium", "low"] as const).map((level) => {
                      const cfg = RISK_COLORS[level];
                      const count = riskByLevel[level];
                      const w = pct(count, riskByLevel.total);
                      return (
                        <div key={level} className="flex items-center gap-3">
                          <div className={`w-20 text-xs font-semibold ${cfg.text}`}>{cfg.label}</div>
                          <div className="flex-1 h-6 rounded-md bg-muted overflow-hidden">
                            <div className={`h-full rounded-md ${cfg.bg} ${cfg.text} flex items-center px-2 text-xs font-bold transition-all`}
                              style={{ width: `${Math.max(w, count > 0 ? 10 : 0)}%` }}>
                              {count > 0 && count}
                            </div>
                          </div>
                          <div className="w-10 text-right text-xs text-muted-foreground">{w}%</div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Action Status */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Status do Plano de Ação</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-3">
                        <Progress value={pct(actionStats.done, actionStats.total)} className="h-3 flex-1" />
                        <span className="text-sm font-semibold">{pct(actionStats.done, actionStats.total)}%</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(["planned", "in_progress", "done", "blocked"] as const).map((st) => {
                          const cfg = ACTION_STATUS[st] || ACTION_STATUS.planned;
                          return (
                            <div key={st} className={`rounded-lg p-2.5 text-center ${cfg.color}`}>
                              <div className="text-lg font-bold">{actionStats[st]}</div>
                              <div className="text-xs">{cfg.label}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Dimension Scores */}
              {dimensionScores.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Scores por Dimensão (média)</CardTitle>
                    <CardDescription>Média das avaliações de risco por dimensão psicossocial.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {dimensionScores.map(d => (
                      <DimensionBar key={d.dim} label={d.label} value={d.avg} max={maxDimScore} />
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Campaigns */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Campanhas de Diagnóstico</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.campaigns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma campanha no escopo.</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campanha</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-center">Respostas</TableHead>
                            <TableHead className="text-center">LGPD</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.campaigns.map(c => (
                            <TableRow key={c.id}>
                              <TableCell className="font-medium">{c.name}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="capitalize">{c.status}</Badge>
                              </TableCell>
                              <TableCell className="text-center">{c.responses}</TableCell>
                              <TableCell className="text-center">
                                {c.aggregation_allowed ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto" />
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ===================== TAB: Risks ===================== */}
            <TabsContent value="risks" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Avaliações de Risco</CardTitle>
                  <CardDescription>{data.risks.length} avaliação(ões) no escopo selecionado.</CardDescription>
                </CardHeader>
                <CardContent>
                  {data.risks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum risco classificado.</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Data</TableHead>
                            <TableHead>Nível</TableHead>
                            <TableHead>Score</TableHead>
                            <TableHead>Dimensões</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.risks.map(r => (
                            <TableRow key={r.id}>
                              <TableCell className="text-sm">{fmtDate(r.assessed_at)}</TableCell>
                              <TableCell><RiskBadge level={r.level} /></TableCell>
                              <TableCell className="font-mono text-sm">{(r.score * 100).toFixed(1)}%</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(r.dimension_scores || {}).slice(0, 4).map(([dim, score]) => (
                                    <span key={dim} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                      {DIMENSION_LABELS[dim] || dim}: {(Number(score) * 100).toFixed(0)}%
                                    </span>
                                  ))}
                                  {Object.keys(r.dimension_scores || {}).length > 4 && (
                                    <span className="text-[10px] text-muted-foreground">+{Object.keys(r.dimension_scores).length - 4}</span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ===================== TAB: Actions ===================== */}
            <TabsContent value="actions" className="space-y-4 mt-4">
              {(data.action_plans || []).length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum plano de ação vinculado às avaliações no escopo.
                  </CardContent>
                </Card>
              ) : (
                (data.action_plans || []).map(plan => (
                  <Card key={plan.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          Plano de Ação
                          <Badge variant="outline" className="ml-2 capitalize">{plan.status}</Badge>
                          <span className="text-xs text-muted-foreground ml-2">v{plan.version}</span>
                        </CardTitle>
                        <span className="text-xs text-muted-foreground">{fmtDate(plan.created_at)}</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {(plan.items || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum item neste plano.</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Responsável</TableHead>
                                <TableHead>Prazo</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-center">Evidências</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(plan.items || []).map(item => {
                                const stCfg = ACTION_STATUS[item.status] || ACTION_STATUS.planned;
                                return (
                                  <TableRow key={item.id}>
                                    <TableCell>
                                      <div className="font-medium text-sm">{item.title}</div>
                                      {item.description && (
                                        <div className="text-xs text-muted-foreground line-clamp-1">{item.description}</div>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Badge variant="outline" className="text-xs capitalize">{item.item_type}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">{item.responsible || "—"}</TableCell>
                                    <TableCell className="text-sm">{fmtDate(item.due_date)}</TableCell>
                                    <TableCell>
                                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${stCfg.color}`}>
                                        {stCfg.label}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-center text-sm">
                                      {(item.evidences || []).length}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* ===================== TAB: Training ===================== */}
            <TabsContent value="training" className="space-y-4 mt-4">
              {!training ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Dados de treinamento não disponíveis. Gere o relatório novamente.
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Training Summary Cards */}
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                    <MetricCard icon={Users} label="Total Matrículas" value={training.summary.total_enrollments} />
                    <MetricCard icon={CheckCircle2} label="Concluídos" value={training.summary.completed}
                      sub={`${training.summary.completion_rate.toFixed(1)}%`} />
                    <MetricCard icon={Clock} label="Pendentes" value={training.summary.pending + training.summary.in_progress} />
                    <MetricCard icon={Award} label="Certificados" value={training.summary.certificates_issued} />
                  </div>

                  {/* Completion Progress */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Progresso Geral de Capacitação</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-3 mb-4">
                        <Progress value={training.summary.completion_rate} className="h-4 flex-1" />
                        <span className="text-lg font-bold">{training.summary.completion_rate.toFixed(1)}%</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center text-xs">
                        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-2">
                          <div className="text-lg font-bold text-green-700 dark:text-green-400">{training.summary.completed}</div>
                          <div className="text-muted-foreground">Concluídos</div>
                        </div>
                        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2">
                          <div className="text-lg font-bold text-blue-700 dark:text-blue-400">{training.summary.in_progress}</div>
                          <div className="text-muted-foreground">Em Andamento</div>
                        </div>
                        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 p-2">
                          <div className="text-lg font-bold text-amber-700 dark:text-amber-400">{training.summary.pending}</div>
                          <div className="text-muted-foreground">Pendentes</div>
                        </div>
                        <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2">
                          <div className="text-lg font-bold text-red-700 dark:text-red-400">{training.summary.expired}</div>
                          <div className="text-muted-foreground">Expirados</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Training Items Detail */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Itens Educativos</CardTitle>
                      <CardDescription>{training.items.length} item(ns) de capacitação.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {training.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhum item educativo cadastrado.</p>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Treinamento</TableHead>
                                <TableHead className="text-center">Matrículas</TableHead>
                                <TableHead className="text-center">Concluídos</TableHead>
                                <TableHead>Progresso</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {training.items.map(item => {
                                const stCfg = ACTION_STATUS[item.status] || ACTION_STATUS.planned;
                                return (
                                  <TableRow key={item.id}>
                                    <TableCell>
                                      <div className="font-medium text-sm">{item.title}</div>
                                      <div className="flex gap-1 mt-0.5">
                                        {item.training_type && (
                                          <span className="rounded bg-purple-100 dark:bg-purple-900/30 px-1.5 py-0.5 text-[10px] text-purple-700 dark:text-purple-300">
                                            {item.training_type === "initial" ? "Inicial" : item.training_type === "periodic" ? "Periódico" : "Eventual"}
                                          </span>
                                        )}
                                        {item.control_hierarchy && (
                                          <span className="rounded bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300">
                                            {item.control_hierarchy}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-center font-mono">{item.enrollment_total}</TableCell>
                                    <TableCell className="text-center font-mono">{item.enrollment_completed}</TableCell>
                                    <TableCell>
                                      <div className="flex items-center gap-2">
                                        <Progress value={item.completion_rate} className="h-2 w-20" />
                                        <span className="text-xs">{item.completion_rate.toFixed(0)}%</span>
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${stCfg.color}`}>
                                        {stCfg.label}
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* ===================== TAB: Audit ===================== */}
            <TabsContent value="audit" className="space-y-4 mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Trilha de Auditoria</CardTitle>
                      <CardDescription>{pagedAudit.total} evento(s) registrado(s). Retenção mínima: 20 anos (NR-1).</CardDescription>
                    </div>
                    <Badge variant="outline">{pagedAudit.total} eventos</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {pagedAudit.total === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum evento de auditoria.</p>
                  ) : (
                    <>
                      <div className="border rounded-lg overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Data/Hora</TableHead>
                              <TableHead>Ação</TableHead>
                              <TableHead>Entidade</TableHead>
                              <TableHead>IP</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pagedAudit.items.map(evt => (
                              <TableRow key={evt.id}>
                                <TableCell className="text-xs font-mono whitespace-nowrap">{fmtDateTime(evt.created_at)}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">{evt.action}</Badge>
                                </TableCell>
                                <TableCell className="text-xs">{evt.entity_type}</TableCell>
                                <TableCell className="text-xs font-mono text-muted-foreground">{evt.ip || "—"}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>

                      {/* Pagination */}
                      {pagedAudit.pages > 1 && (
                        <div className="flex items-center justify-between mt-3">
                          <span className="text-xs text-muted-foreground">
                            Página {auditPage + 1} de {pagedAudit.pages}
                          </span>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" disabled={auditPage === 0}
                              onClick={() => setAuditPage(p => p - 1)}>
                              Anterior
                            </Button>
                            <Button variant="outline" size="sm" disabled={auditPage >= pagedAudit.pages - 1}
                              onClick={() => setAuditPage(p => p + 1)}>
                              Próxima
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Retention notice */}
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/10">
                <CardContent className="flex items-start gap-3 pt-4">
                  <Shield className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-medium text-amber-800 dark:text-amber-300">
                      Retenção obrigatória de 20 anos
                    </div>
                    <div className="text-xs text-amber-700 dark:text-amber-400">
                      A NR-1 exige que todos os registros do PGR (incluindo trilha de auditoria, evidências e certificados)
                      sejam mantidos por no mínimo 20 anos para fins de fiscalização.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}
