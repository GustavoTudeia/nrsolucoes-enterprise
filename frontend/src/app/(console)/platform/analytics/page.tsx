"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getPlatformAnalyticsOverview, listPlatformTenantHealth, runRetentionWorkflows } from "@/lib/api/analytics";
import type { PlatformAnalyticsOverviewOut, PlatformTenantHealthItemOut } from "@/lib/api/types";

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "—";
}

function bandLabel(band: string) {
  if (band === "healthy") return "Saudável";
  if (band === "attention") return "Atenção";
  if (band === "risk") return "Risco";
  return "Crítico";
}

function bandClass(band: string) {
  if (band === "healthy") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
  if (band === "attention") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
  if (band === "risk") return "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
}

export default function PlatformAnalyticsPage() {
  const [overview, setOverview] = useState<PlatformAnalyticsOverviewOut | null>(null);
  const [tenants, setTenants] = useState<PlatformTenantHealthItemOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [band, setBand] = useState("");
  const [search, setSearch] = useState("");

  async function refresh(selectedBand = band) {
    try {
      const [ov, rows] = await Promise.all([
        getPlatformAnalyticsOverview(),
        listPlatformTenantHealth({ band: selectedBand || undefined }),
      ]);
      setOverview(ov);
      setTenants(rows || []);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar analytics da plataforma");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = tenants.filter((row) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return row.tenant_name.toLowerCase().includes(q) || (row.tenant_slug || "").toLowerCase().includes(q) || (row.plan_key || "").toLowerCase().includes(q);
  });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader title="Analytics & Retenção" description="Saúde dos tenants, coortes de risco e execução de workflows anti-churn." />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="Tenants" value={overview?.total_tenants ?? 0} />
        <MetricCard label="Saudáveis" value={overview?.healthy_tenants ?? 0} tone="green" />
        <MetricCard label="Atenção" value={overview?.attention_tenants ?? 0} tone="yellow" />
        <MetricCard label="Risco" value={overview?.risk_tenants ?? 0} tone="orange" />
        <MetricCard label="Críticos" value={overview?.critical_tenants ?? 0} tone="red" />
        <MetricCard label="Score médio" value={Math.round(overview?.average_score ?? 0)} tone="blue" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Workflows de retenção</CardTitle>
              <CardDescription>Executa nudges automáticos para tenants em risco, com opção de e-mail operacional.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refresh()} disabled={loading}>Atualizar</Button>
              <Button onClick={async () => {
                try {
                  setRunning(true);
                  const result = await runRetentionWorkflows({ sendEmails: true });
                  toast.success(`Workflows executados: ${result.processed_tenants} tenant(s), ${result.nudges_generated} nudge(s)`);
                  await refresh();
                } catch (e: any) {
                  toast.error(e?.message || "Falha ao executar workflows");
                } finally {
                  setRunning(false);
                }
              }} disabled={running}>{running ? "Executando..." : "Executar workflows"}</Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Saúde por tenant</CardTitle>
              <CardDescription>Visão operacional para Customer Success, growth e prevenção de churn.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Buscar tenant, slug ou plano" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[260px]" />
              <select className="h-10 rounded-md border bg-background px-3 text-sm" value={band} onChange={(e) => { setBand(e.target.value); refresh(e.target.value); }}>
                <option value="">Todas as bandas</option>
                <option value="healthy">Saudável</option>
                <option value="attention">Atenção</option>
                <option value="risk">Risco</option>
                <option value="critical">Crítico</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Billing</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Banda</TableHead>
                  <TableHead>Ativação</TableHead>
                  <TableHead>Último valor</TableHead>
                  <TableHead>Riscos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">Nenhum tenant encontrado.</TableCell></TableRow>
                ) : filtered.map((row) => (
                  <TableRow key={row.tenant_id}>
                    <TableCell>
                      <div className="font-medium">{row.tenant_name}</div>
                      <div className="text-xs text-muted-foreground">{row.tenant_slug || "—"}</div>
                    </TableCell>
                    <TableCell>{row.plan_key || "—"}</TableCell>
                    <TableCell>{row.billing_status || "—"}</TableCell>
                    <TableCell className="font-semibold">{row.score}</TableCell>
                    <TableCell><Badge className={bandClass(row.band)}>{bandLabel(row.band)}</Badge></TableCell>
                    <TableCell>{row.activation_status}</TableCell>
                    <TableCell>{fmtDate(row.last_value_event_at)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(row.risk_flags || []).slice(0, 3).map((flag) => <Badge key={flag} variant="outline">{flag}</Badge>)}
                        {(!row.risk_flags || row.risk_flags.length === 0) ? <span className="text-xs text-muted-foreground">—</span> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "yellow" | "orange" | "red" | "blue" }) {
  const toneClass = tone === "green"
    ? "text-green-600"
    : tone === "yellow"
    ? "text-yellow-600"
    : tone === "orange"
    ? "text-orange-600"
    : tone === "red"
    ? "text-red-600"
    : tone === "blue"
    ? "text-blue-600"
    : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-3xl font-bold mt-1 ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
