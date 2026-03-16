"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { listCampaigns } from "@/lib/api/campaigns";
import { assessCampaign, listCriteria, listAssessments } from "@/lib/api/risks";
import { listUnits } from "@/lib/api/org";
import { useConsole } from "@/components/console/console-provider";
import type { CampaignDetailOut, CriterionOut, OrgUnitOut, RiskAssessmentOut } from "@/lib/api/types";
import {
  AlertTriangle, Shield, ShieldCheck, ShieldAlert,
  BarChart3, TrendingUp, ArrowRight, Activity, Target,
  ChevronDown, ChevronUp, Layers,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Dimension labels (pt-BR)
// ---------------------------------------------------------------------------
const DIMENSION_LABELS: Record<string, string> = {
  governance: "Governanca e Lideranca",
  hazards: "Identificacao de Perigos",
  controls: "Medidas de Controle",
  training: "Treinamento e Comunicacao",
  workload: "Carga de Trabalho",
  autonomy: "Autonomia e Flexibilidade",
  social_support: "Suporte Social",
  conflict: "Conflito e Violencia",
  job_security: "Seguranca no Emprego",
  work_life: "Equilibrio Vida-Trabalho",
  career: "Desenvolvimento de Carreira",
  justice: "Justica Organizacional",
  general: "Geral",
};

function dimLabel(key: string) {
  return DIMENSION_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Risk visual helpers
// ---------------------------------------------------------------------------
function riskColor(level: string) {
  const v = level.toLowerCase();
  if (v === "high") return { bg: "bg-red-500", text: "text-red-700", light: "bg-red-100", border: "border-red-200" };
  if (v === "medium") return { bg: "bg-amber-500", text: "text-amber-700", light: "bg-amber-100", border: "border-amber-200" };
  return { bg: "bg-emerald-500", text: "text-emerald-700", light: "bg-emerald-100", border: "border-emerald-200" };
}

function riskLabel(level: string) {
  const v = level.toLowerCase();
  if (v === "high") return "ALTO";
  if (v === "medium") return "MEDIO";
  return "BAIXO";
}

function RiskBadge({ level }: { level: string }) {
  const c = riskColor(level);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.light} ${c.text}`}>
      {level.toLowerCase() === "high" ? <ShieldAlert className="h-3 w-3" /> :
       level.toLowerCase() === "medium" ? <AlertTriangle className="h-3 w-3" /> :
       <ShieldCheck className="h-3 w-3" />}
      {riskLabel(level)}
    </span>
  );
}

function DimensionBar({ label, value, showValue = true }: { label: string; value: number; showValue?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const barColor = pct >= 70 ? "bg-red-500" : pct >= 45 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground truncate">{label}</span>
        {showValue && <span className="font-medium tabular-nums">{pct}%</span>}
      </div>
      <div className="h-2.5 w-full rounded-full bg-muted">
        <div className={`h-2.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function RiscoPage() {
  const { scope } = useConsole();

  const [campaigns, setCampaigns] = useState<CampaignDetailOut[]>([]);
  const [criteria, setCriteria] = useState<CriterionOut[]>([]);
  const [assessments, setAssessments] = useState<RiskAssessmentOut[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitOut[]>([]);

  const [campaignId, setCampaignId] = useState("");
  const [criterionId, setCriterionId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");
  const [assessing, setAssessing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function loadInitial() {
    try {
      const [camps, crit] = await Promise.all([
        listCampaigns({ limit: 200, offset: 0, cnpj_id: scope.cnpjId || undefined }),
        listCriteria({ limit: 200, offset: 0 }),
      ]);
      setCampaigns(camps.items);
      setCriteria(crit.items);
      if (!campaignId && camps.items[0]?.id) setCampaignId(camps.items[0].id);
      if (!criterionId && crit.items[0]?.id) setCriterionId(crit.items[0].id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar dados");
    }
  }

  async function refreshUnits() {
    try {
      if (!scope.cnpjId) { setOrgUnits([]); return; }
      const u = await listUnits(scope.cnpjId);
      setOrgUnits(u);
    } catch { setOrgUnits([]); }
  }

  async function refreshAssessments(cid: string) {
    if (!cid) return;
    try {
      const r = await listAssessments({ campaign_id: cid, limit: 200, offset: 0 });
      setAssessments(r.items);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao listar avaliacoes");
    }
  }

  useEffect(() => {
    loadInitial();
    refreshUnits();
  }, [scope.cnpjId]);

  useEffect(() => {
    if (campaignId) refreshAssessments(campaignId);
  }, [campaignId]);

  async function onAssess() {
    setAssessing(true);
    try {
      if (!campaignId) throw new Error("Selecione uma campanha");
      if (!criterionId) throw new Error("Selecione um criterio");
      const r = await assessCampaign(campaignId, criterionId, orgUnitId || undefined);
      toast.success(`Risco classificado: ${riskLabel(r.level)} (${(r.score * 100).toFixed(0)}%)`);
      await refreshAssessments(campaignId);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao classificar risco (verifique minimo LGPD)");
    } finally {
      setAssessing(false);
    }
  }

  // Summary stats
  const highCount = assessments.filter((a) => a.level === "high").length;
  const mediumCount = assessments.filter((a) => a.level === "medium").length;
  const lowCount = assessments.filter((a) => a.level === "low").length;
  const latestAssessment = assessments[0] || null;

  // Average dimension scores across all assessments
  const avgDimensions = useMemo(() => {
    if (assessments.length === 0) return {};
    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const a of assessments) {
      for (const [dim, val] of Object.entries(a.dimension_scores || {})) {
        sums[dim] = (sums[dim] || 0) + Number(val);
        counts[dim] = (counts[dim] || 0) + 1;
      }
    }
    const avg: Record<string, number> = {};
    for (const dim of Object.keys(sums)) {
      avg[dim] = sums[dim] / counts[dim];
    }
    return avg;
  }, [assessments]);

  const sortedDimensions = useMemo(() => {
    return Object.entries(avgDimensions).sort((a, b) => b[1] - a[1]);
  }, [avgDimensions]);

  // Heat map: assessments by org unit
  const unitAssessments = useMemo(() => {
    const map = new Map<string, RiskAssessmentOut>();
    // Keep most recent per org_unit
    for (const a of assessments) {
      const key = a.org_unit_id || "__global__";
      if (!map.has(key)) map.set(key, a);
    }
    return Array.from(map.values());
  }, [assessments]);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Avaliação de Riscos NR-1"
        description="Classificação de risco conforme NR-1 com base em governança, evidências e inventário de perigos."
      />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2.5">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{assessments.length}</p>
                <p className="text-sm text-muted-foreground">Avaliacoes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className={highCount > 0 ? "border-red-200" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2.5">
                <ShieldAlert className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{highCount}</p>
                <p className="text-sm text-muted-foreground">Risco Alto</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mediumCount}</p>
                <p className="text-sm text-muted-foreground">Risco Medio</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2.5">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{lowCount}</p>
                <p className="text-sm text-muted-foreground">Risco Baixo</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dimension overview (average across assessments) */}
      {sortedDimensions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              Panorama por Dimensao
            </CardTitle>
            <CardDescription>
              Media ponderada de todas as avaliacoes da campanha selecionada.
              Scores mais altos indicam melhor maturidade de controle e menor risco residual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {sortedDimensions.map(([dim, val]) => (
                <DimensionBar key={dim} label={dimLabel(dim)} value={val} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heat map by org unit */}
      {unitAssessments.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-muted-foreground" />
              Mapa de Risco por Setor
            </CardTitle>
            <CardDescription>Comparativo da avaliacao mais recente por unidade/setor.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {unitAssessments.map((a) => {
                const c = riskColor(a.level);
                const pct = Math.round(a.score * 100);
                return (
                  <div key={a.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${c.border}`}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-3 w-3 rounded-full ${c.bg}`} />
                      <span className="font-medium truncate">
                        {a.org_unit_name || (a.org_unit_id ? a.org_unit_id : "Campanha inteira")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="w-24 h-2 rounded-full bg-muted">
                        <div className={`h-2 rounded-full ${c.bg}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-medium tabular-nums w-10 text-right">{pct}%</span>
                      <RiskBadge level={a.level} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Classify form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-muted-foreground" />
            Nova Avaliacao
          </CardTitle>
          <CardDescription>
            Selecione campanha e criterio. Opcionalmente filtre por setor para priorizacao de acoes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Campanha</label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">Selecione</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Criterio</label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={criterionId} onChange={(e) => setCriterionId(e.target.value)}>
              <option value="">Selecione</option>
              {criteria.map((c) => (
                <option key={c.id} value={c.id}>{c.name} (v{c.version})</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Setor (opcional)</label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} disabled={!scope.cnpjId}>
              <option value="">(Campanha inteira)</option>
              {orgUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 flex gap-2">
            <Button onClick={onAssess} disabled={!campaignId || !criterionId || assessing}>
              {assessing ? "Processando..." : "Classificar Risco"}
            </Button>
            <Button variant="outline" asChild>
              <Link className="no-underline" href="/plano-acao">
                <ArrowRight className="h-4 w-4 mr-1" /> Plano de Acao
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Assessment history */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
            Historico de Avaliacoes
          </CardTitle>
          <CardDescription>{assessments.length} avaliacao(oes) para a campanha selecionada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {assessments.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nenhuma avaliacao realizada para esta campanha.</p>
              <p className="text-sm mt-1">Selecione uma campanha e clique em "Classificar Risco".</p>
            </div>
          ) : (
            assessments.map((a) => {
              const dims = Object.entries(a.dimension_scores || {}).sort((x, y) => Number(y[1]) - Number(x[1]));
              const isExpanded = expandedId === a.id;
              const c = riskColor(a.level);

              return (
                <div key={a.id} className={`rounded-lg border ${c.border} transition-all`}>
                  {/* Header */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/30 transition-colors rounded-lg"
                    onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <RiskBadge level={a.level} />
                      <span className="font-semibold tabular-nums">{(a.score * 100).toFixed(0)}%</span>
                      <span className="text-sm text-muted-foreground truncate">
                        {a.org_unit_name || "Campanha inteira"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.assessed_at).toLocaleDateString("pt-BR")}
                      </span>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t">
                      <div className="pt-4 grid gap-3 md:grid-cols-2">
                        {dims.map(([dim, val]) => (
                          <DimensionBar key={dim} label={dimLabel(dim)} value={Number(val)} />
                        ))}
                      </div>

                      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                        <div className="space-y-0.5">
                          <div>Campanha: {a.campaign_name || a.campaign_id}</div>
                          <div>Criterio: {a.criterion_name || a.criterion_version_id}</div>
                          <div>Data: {new Date(a.assessed_at).toLocaleString("pt-BR")}</div>
                        </div>
                        <Button size="sm" variant="outline" asChild>
                          <Link className="no-underline" href="/plano-acao">
                            <ArrowRight className="h-3.5 w-3.5 mr-1" /> Criar Acao
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
