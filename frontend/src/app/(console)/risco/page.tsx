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

function RiskBadge({ level }: { level: string }) {
  const v = String(level).toLowerCase();
  if (v === "high") return <Badge variant="destructive">ALTO</Badge>;
  if (v === "medium") return <Badge variant="secondary">MÉDIO</Badge>;
  return <Badge variant="default">BAIXO</Badge>;
}

function Bar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className="h-2 rounded-full bg-primary" style={{ width: `${v}%` }} />
    </div>
  );
}

export default function RiscoPage() {
  const { scope } = useConsole();

  const [campaigns, setCampaigns] = useState<CampaignDetailOut[]>([]);
  const [criteria, setCriteria] = useState<CriterionOut[]>([]);
  const [assessments, setAssessments] = useState<RiskAssessmentOut[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitOut[]>([]);

  const [campaignId, setCampaignId] = useState("");
  const [criterionId, setCriterionId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string>("");

  const unitName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of orgUnits) map[u.id] = u.name;
    return map;
  }, [orgUnits]);

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

  async function refreshAssessments(cid: string) {
    if (!cid) return;
    try {
      const r = await listAssessments({ campaign_id: cid, limit: 200, offset: 0 });
      setAssessments(r.items);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao listar avaliações");
    }
  }

  useEffect(() => {
    loadInitial();
    refreshUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.cnpjId]);

  useEffect(() => {
    if (campaignId) refreshAssessments(campaignId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  const campaignOptions = useMemo(() => campaigns.map((c) => ({ id: c.id, label: `${c.name} • ${c.status}` })), [campaigns]);
  const criterionOptions = useMemo(() => criteria.map((c) => ({ id: c.id, label: `${c.name} • v${c.version} • ${c.status}` })), [criteria]);

  async function onAssess() {
    try {
      if (!campaignId) throw new Error("Selecione uma campanha");
      if (!criterionId) throw new Error("Selecione um critério");
      const r = await assessCampaign(campaignId, criterionId, orgUnitId || undefined);
      toast.success(`Risco classificado: ${r.level} (${r.score.toFixed(2)})`);
      await refreshAssessments(campaignId);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao classificar risco (verifique mínimo LGPD)");
    }
  }

  const dimensionTop = (a: RiskAssessmentOut) => {
    const entries = Object.entries((a.dimension_scores as any) || {}).map(([k, v]) => [k, Number(v)] as const);
    entries.sort((x, y) => y[1] - x[1]);
    return entries[0] || null;
  };

  return (
    <div className="container py-8 space-y-6">
      <PageHeader title="Classificação de Risco (M3)" description="Critérios versionados sobre agregados (sem PII) com trilha de auditoria." />

      <Card>
        <CardHeader>
          <CardTitle>Classificar</CardTitle>
          <CardDescription>
            Selecione campanha e critério. Opcionalmente, restrinja por unidade/setor (quando aplicável) para priorização de ações.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
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

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Critério</div>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={criterionId} onChange={(e) => setCriterionId(e.target.value)}>
              <option value="">Selecione</option>
              {criterionOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <div className="text-xs text-muted-foreground">Unidade/Setor (opcional)</div>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} disabled={!scope.cnpjId}>
              <option value="">(Auto / campanha inteira)</option>
              {orgUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 flex gap-2">
            <Button onClick={onAssess} disabled={!campaignId || !criterionId}>
              Classificar
            </Button>
            <Button variant="secondary" onClick={loadInitial}>
              Atualizar listas
            </Button>
            <Button variant="outline" asChild>
              <Link className="no-underline" href="/plano-acao">
                Abrir plano de ação
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
          <CardDescription>{assessments.length} avaliação(ões) para a campanha selecionada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {assessments.map((a) => {
            const top = dimensionTop(a);
            return (
              <div key={a.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <RiskBadge level={a.level} />
                      <div className="font-medium">score {a.score.toFixed(2)}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.org_unit_id ? `Setor: ${unitName[a.org_unit_id] || a.org_unit_id}` : "Setor: (campanha inteira)"} • {new Date(a.assessed_at).toLocaleString()}
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" asChild>
                    <Link className="no-underline" href="/plano-acao">
                      Plano de ação
                    </Link>
                  </Button>
                </div>

                {top ? (
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground">Dimensão prioritária: {top[0]} ({top[1].toFixed(2)})</div>
                    <div className="mt-2">
                      <Bar value={top[1]} />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          {assessments.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma avaliação ainda.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
