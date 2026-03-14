"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

import { toast } from "sonner";
import { createCheckoutSession, createPortalSession, getSubscription, listInvoices, listPlans } from "@/lib/api/billing";
import { getTenantOverview, type TenantOverviewOut } from "@/lib/api/reports";
import type { InvoiceOut, PlanOut, SubscriptionOut } from "@/lib/api/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  const cur = (currency || "BRL").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur }).format(amount / 100);
  } catch {
    return `${cur} ${(amount / 100).toFixed(2)}`;
  }
}

function fmtUnix(ts: number | null | undefined) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleDateString("pt-BR");
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function pct(used: number, max: number) {
  if (!max || max <= 0) return 0;
  return Math.min(100, Math.round((used / max) * 100));
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  trial: { label: "Trial", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  past_due: { label: "Inadimplente", cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  canceled: { label: "Cancelado", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  suspended: { label: "Suspenso", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
};

const INVOICE_STYLE: Record<string, string> = {
  paid: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  open: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  uncollectible: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  void: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

// Features humanas para exibicao nos planos
const FEATURE_LABELS: Record<string, string> = {
  // Módulos
  CAMPAIGNS: "Campanhas",
  QUESTIONNAIRES: "Questionários",
  LMS: "LMS / Treinamentos",
  RISK_MAP: "Mapa de Risco",
  ACTION_PLANS: "Plano de Ação",
  REPORTS: "Relatórios",
  // Conformidade
  ANONYMIZATION: "Anonimização LGPD",
  NR17: "Conformidade NR-17",
  ESOCIAL_EXPORT: "Exportação eSocial",
  AUDIT: "Auditoria",
  AUDIT_EXPORT: "Exportação de auditoria",
  // Infraestrutura
  MULTI_CNPJ: "Multi-CNPJ",
  WHITE_LABEL: "White-label / Branding",
  SSO_OIDC: "SSO (OIDC)",
  API_ACCESS: "Acesso via API",
  MULTI_TENANT_MANAGER: "Gestão multi-tenant",
};

const LIMIT_LABELS: Record<string, { label: string; unit: string }> = {
  cnpj_max: { label: "CNPJs", unit: "" },
  employees_max: { label: "Colaboradores", unit: "" },
  users_max: { label: "Usuários", unit: "" },
  campaigns_max: { label: "Campanhas ativas", unit: "" },
  storage_gb: { label: "Armazenamento", unit: "GB" },
  history_months: { label: "Histórico", unit: "meses" },
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanOut[]>([]);
  const [sub, setSub] = useState<SubscriptionOut | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOut[]>([]);
  const [overview, setOverview] = useState<TenantOverviewOut | null>(null);
  const [affiliateCode, setAffiliateCode] = useState<string>("");

  const currentPlan = useMemo(() => {
    if (!sub?.plan_id) return null;
    return plans.find((p) => p.id === sub.plan_id) || null;
  }, [plans, sub?.plan_id]);

  const subStatus = sub?.status || "none";
  const statusInfo = STATUS_STYLE[subStatus] || { label: subStatus, cls: "bg-gray-100 text-gray-600" };
  const daysLeft = daysUntil(sub?.current_period_end);

  // Limites do plano vs uso real
  const limits = useMemo(() => sub?.entitlements_snapshot?.limits || currentPlan?.limits || {}, [sub, currentPlan]);
  const features = useMemo(() => sub?.entitlements_snapshot?.features || currentPlan?.features || {}, [sub, currentPlan]);

  const usageMeters = useMemo(() => {
    if (!overview) return [];
    const meters: { key: string; label: string; used: number; max: number; unit: string }[] = [];
    if (limits.cnpj_max) meters.push({ key: "cnpjs", label: "CNPJs", used: overview.counts.cnpjs, max: limits.cnpj_max, unit: "" });
    if (limits.employees_max) meters.push({ key: "employees", label: "Colaboradores", used: overview.counts.employees, max: limits.employees_max, unit: "" });
    return meters;
  }, [overview, limits]);

  useEffect(() => {
    const code = localStorage.getItem("nr_affiliate_code") || "";
    setAffiliateCode(code);

    (async () => {
      setLoading(true);
      try {
        const [p, s, ov] = await Promise.all([
          listPlans(),
          getSubscription(),
          getTenantOverview().catch(() => null),
        ]);
        setPlans(p);
        setSub(s);
        setOverview(ov);

        try {
          const inv = await listInvoices();
          setInvoices(inv || []);
        } catch {
          setInvoices([]);
        }
      } catch (e: any) {
        toast.error(e?.message || "Falha ao carregar cobranca");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function startCheckout(planKey: string) {
    try {
      localStorage.setItem("nr_affiliate_code", affiliateCode || "");
      const r = await createCheckoutSession(planKey, affiliateCode || undefined);
      toast.success("Redirecionando para checkout...");
      window.location.href = r.checkout_url;
    } catch (e: any) {
      toast.error(e?.message || "Falha ao iniciar checkout");
    }
  }

  async function openPortal() {
    try {
      const r = await createPortalSession();
      window.location.href = r.url;
    } catch (e: any) {
      toast.error(e?.message || "Falha ao abrir portal de cobranca");
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* ═══════ HEADER ═══════ */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Assinatura & Cobranca</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie seu plano, acompanhe uso e faturas
          </p>
        </div>
        <Button variant="outline" onClick={openPortal}>
          Portal de pagamento
        </Button>
      </div>

      {/* ═══════ BANNERS CONTEXTUAIS ═══════ */}
      {!loading && subStatus === "trial" && (
        <Card className="border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950">
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                Voce esta no periodo de avaliacao gratuita.
                {daysLeft !== null && (
                  <span className="font-bold"> {daysLeft} dia(s) restante(s).</span>
                )}
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Escolha um plano para garantir continuidade e desbloquear todos os recursos.
              </p>
            </div>
            <Button size="sm" onClick={() => document.getElementById("tab-planos")?.click()}>
              Ver planos
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && subStatus === "past_due" && (
        <Card className="border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950">
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Pagamento pendente. Atualize seu meio de pagamento para evitar suspensao do servico.
              </p>
              <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                Seus dados e configuracoes serao preservados, mas o acesso pode ser limitado.
              </p>
            </div>
            <Button size="sm" variant="destructive" onClick={openPortal}>
              Atualizar pagamento
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && subStatus === "suspended" && (
        <Card className="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950">
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Sua conta foi suspensa pelo administrador da plataforma.
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                O acesso às funcionalidades está limitado. Entre em contato com o suporte para regularizar sua situação.
              </p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <a href="mailto:suporte@nrsolucoes.com.br">Contatar suporte</a>
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && subStatus === "canceled" && (
        <Card className="border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950">
          <CardContent className="py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Sua assinatura foi cancelada. Seus dados permanecem armazenados por 90 dias.
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Reative a qualquer momento escolhendo um plano abaixo.
              </p>
            </div>
            <Button size="sm" onClick={() => document.getElementById("tab-planos")?.click()}>
              Reativar
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══════ KPI CARDS ═══════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Status</p>
            <Badge className={`mt-2 ${statusInfo.cls}`}>{statusInfo.label}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Plano</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{currentPlan?.name || "Nenhum"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Proximo vencimento</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{fmtDate(sub?.current_period_end)}</p>
            {daysLeft !== null && daysLeft <= 7 && (
              <p className="text-xs text-amber-600 mt-1">{daysLeft} dia(s)</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Faturas</p>
            <p className="text-2xl font-bold mt-1 text-foreground">{invoices.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {invoices.filter((i) => i.status === "paid").length} pagas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ═══════ TABS ═══════ */}
      <Tabs defaultValue="assinatura">
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
          <TabsTrigger value="planos" id="tab-planos">Planos</TabsTrigger>
          <TabsTrigger value="faturas">Faturas</TabsTrigger>
        </TabsList>

        {/* ═══════ TAB: ASSINATURA ═══════ */}
        <TabsContent value="assinatura" className="space-y-6 mt-6">
          {loading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
          ) : (
            <>
              {/* Uso vs Limites */}
              {usageMeters.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Consumo do Plano</CardTitle>
                    <CardDescription>Uso atual dos recursos em relacao aos limites do seu plano</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {usageMeters.map((m) => {
                      const p = pct(m.used, m.max);
                      const nearLimit = p >= 80;
                      return (
                        <div key={m.key} className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="font-medium">{m.label}</span>
                            <span className={`text-sm ${nearLimit ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                              {m.used.toLocaleString("pt-BR")} / {m.max.toLocaleString("pt-BR")}{m.unit ? ` ${m.unit}` : ""} ({p}%)
                            </span>
                          </div>
                          <Progress value={p} className={`h-3 ${nearLimit ? "[&>div]:bg-amber-500" : ""}`} />
                          {nearLimit && (
                            <p className="text-xs text-amber-600">
                              Voce esta proximo do limite. Considere fazer upgrade para ampliar sua capacidade.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {/* Features ativas */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Recursos do Plano</CardTitle>
                  <CardDescription>Features e limites incluidos na sua assinatura atual</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                    {/* Features */}
                    {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                      const enabled = !!features[key];
                      return (
                        <div key={key} className="flex items-center gap-3 py-1">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            enabled
                              ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {enabled ? "✓" : "—"}
                          </div>
                          <span className={`text-sm ${enabled ? "text-foreground" : "text-muted-foreground line-through"}`}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Limites */}
                  {Object.keys(limits).length > 0 && (
                    <>
                      <Separator className="my-4" />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(LIMIT_LABELS).map(([key, { label, unit }]) => {
                          const val = limits[key];
                          if (val === undefined || val === null) return null;
                          const display = val >= 9999 ? "Ilimitado" : `${val.toLocaleString("pt-BR")}${unit ? ` ${unit}` : ""}`;
                          return (
                            <div key={key} className="rounded-lg bg-muted/40 px-4 py-3 text-center">
                              <p className="text-xs text-muted-foreground">{label}</p>
                              <p className="text-lg font-bold mt-1">{display}</p>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Acoes */}
              <Card>
                <CardContent className="pt-6 flex flex-wrap gap-3">
                  <Button onClick={openPortal} variant="outline">
                    Gerenciar pagamento
                  </Button>
                  <Button variant="outline" onClick={() => document.getElementById("tab-planos")?.click()}>
                    Trocar de plano
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ═══════ TAB: PLANOS ═══════ */}
        <TabsContent value="planos" className="space-y-6 mt-6">
          {/* Codigo afiliado */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-end gap-4 max-w-lg">
                <div className="flex-1 space-y-2">
                  <Label htmlFor="affiliate">Codigo de afiliado (opcional)</Label>
                  <Input
                    id="affiliate"
                    value={affiliateCode}
                    onChange={(e) => setAffiliateCode(e.target.value)}
                    placeholder="Ex.: JOAO-CONTADOR"
                  />
                </div>
                <p className="text-xs text-muted-foreground pb-2">
                  Aplica desconto e registra a indicacao.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Comparacao de planos */}
          {loading ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando planos...</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((p) => {
                const isCurrent = !!currentPlan && currentPlan.id === p.id;
                const planFeatures = p.features || {};
                const planLimits = p.limits || {};
                return (
                  <Card key={p.id} className={`relative ${isCurrent ? "border-primary ring-2 ring-primary/20" : ""}`}>
                    {isCurrent && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                        <Badge className="bg-primary text-primary-foreground">Plano atual</Badge>
                      </div>
                    )}
                    <CardHeader className="text-center pb-2">
                      <CardTitle className="text-lg">{p.name}</CardTitle>
                      <CardDescription>{p.key}</CardDescription>
                      <div className="pt-2">
                        {p.is_custom_price ? (
                          <span className="text-sm font-medium text-muted-foreground">Sob consulta</span>
                        ) : p.price_monthly ? (
                          <span className="text-2xl font-bold">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.price_monthly / 100)}
                            <span className="text-xs font-normal text-muted-foreground">/mês</span>
                          </span>
                        ) : null}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Limites */}
                      <div className="space-y-2">
                        {Object.entries(LIMIT_LABELS).map(([key, { label, unit }]) => {
                          const val = planLimits[key];
                          if (val === undefined || val === null) return null;
                          const display = val >= 9999 ? "Ilimitado" : `${val.toLocaleString("pt-BR")}${unit ? ` ${unit}` : ""}`;
                          return (
                            <div key={key} className="flex justify-between text-sm">
                              <span className="text-muted-foreground">{label}</span>
                              <span className="font-medium">{display}</span>
                            </div>
                          );
                        })}
                      </div>

                      <Separator />

                      {/* Features */}
                      <div className="space-y-1.5">
                        {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                          const enabled = !!planFeatures[key];
                          return (
                            <div key={key} className="flex items-center gap-2 text-xs">
                              <span className={enabled ? "text-green-600" : "text-muted-foreground"}>
                                {enabled ? "✓" : "—"}
                              </span>
                              <span className={enabled ? "text-foreground" : "text-muted-foreground"}>
                                {label}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <Button
                        className="w-full"
                        variant={isCurrent ? "outline" : "default"}
                        onClick={() => startCheckout(p.key)}
                        disabled={isCurrent}
                      >
                        {isCurrent ? "Plano atual" : "Assinar"}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════ TAB: FATURAS ═══════ */}
        <TabsContent value="faturas" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historico de Faturas</CardTitle>
              <CardDescription>Ultimas faturas registradas no provedor de pagamento</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Carregando...</div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma fatura encontrada.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Numero</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => {
                      const invStatus = inv.status || "draft";
                      const invStyle = INVOICE_STYLE[invStatus] || INVOICE_STYLE.draft;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium font-mono text-sm">{inv.number || inv.id.slice(0, 12)}</TableCell>
                          <TableCell>
                            <Badge className={invStyle}>{invStatus}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">{fmtUnix(inv.created)}</TableCell>
                          <TableCell className="font-medium">{formatMoney(inv.amount_due ?? inv.amount_paid, inv.currency)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex gap-1 justify-end">
                              {inv.hosted_invoice_url && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">Abrir</a>
                                </Button>
                              )}
                              {inv.invoice_pdf && (
                                <Button variant="outline" size="sm" asChild>
                                  <a href={inv.invoice_pdf} target="_blank" rel="noreferrer">PDF</a>
                                </Button>
                              )}
                              {!inv.hosted_invoice_url && !inv.invoice_pdf && (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
