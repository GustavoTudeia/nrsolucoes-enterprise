"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { toast } from "sonner";
import { createCheckoutSession, createPortalSession, getSubscription, listInvoices, listPlans } from "@/lib/api/billing";
import type { InvoiceOut, PlanOut, SubscriptionOut } from "@/lib/api/types";

function formatMoneyMinor(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined) return "—";
  const cur = (currency || "BRL").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur }).format(amount / 100);
  } catch {
    return `${cur} ${(amount / 100).toFixed(2)}`;
  }
}

function formatDateFromUnix(created: number | null | undefined) {
  if (!created) return "—";
  const d = new Date(created * 1000);
  return d.toLocaleDateString("pt-BR");
}

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanOut[]>([]);
  const [sub, setSub] = useState<SubscriptionOut | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOut[]>([]);
  const [affiliateCode, setAffiliateCode] = useState<string>("");

  const currentPlan = useMemo(() => {
    if (!sub?.plan_id) return null;
    return plans.find((p) => p.id === sub.plan_id) || null;
  }, [plans, sub?.plan_id]);

  useEffect(() => {
    const code = localStorage.getItem("nr_affiliate_code") || "";
    setAffiliateCode(code);

    (async () => {
      setLoading(true);
      try {
        const [p, s] = await Promise.all([listPlans(), getSubscription()]);
        setPlans(p);
        setSub(s);

        // Invoices: só TENANT_ADMIN consegue; se falhar, não bloqueia a página.
        try {
          const inv = await listInvoices();
          setInvoices(inv || []);
        } catch {
          setInvoices([]);
        }
      } catch (e: any) {
        toast.error(e?.message || "Falha ao carregar cobrança");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function startCheckout(planKey: string) {
    try {
      localStorage.setItem("nr_affiliate_code", affiliateCode || "");
      const r = await createCheckoutSession(planKey, affiliateCode || undefined);
      toast.success("Redirecionando para checkout…");
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
      toast.error(e?.message || "Falha ao abrir portal de cobrança");
    }
  }

  return (
    <div className="container py-8 space-y-6">
      <PageHeader title="Cobrança" description="Assinatura, faturas e gestão de pagamento recorrente." />

      <Tabs defaultValue="assinatura" className="w-full">
        <TabsList>
          <TabsTrigger value="assinatura">Assinatura</TabsTrigger>
          <TabsTrigger value="faturas">Faturas</TabsTrigger>
          <TabsTrigger value="planos">Planos</TabsTrigger>
        </TabsList>

        <TabsContent value="assinatura" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Assinatura atual</CardTitle>
              <CardDescription>Status, plano e entitlements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="text-sm text-muted-foreground">Carregando…</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={sub?.status === "active" ? "default" : "secondary"}>{sub?.status || "—"}</Badge>
                    {currentPlan ? (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Plano:</span>{" "}
                        <span className="font-medium">{currentPlan.name}</span>{" "}
                        <span className="text-muted-foreground">({currentPlan.key})</span>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">Plano: não definido</div>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Período atual até:</span>{" "}
                    {sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("pt-BR") : "—"}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="text-sm font-medium">Entitlements (snapshot)</div>
                    <pre className="rounded-md border bg-muted/20 p-3 text-xs overflow-auto">
{JSON.stringify(sub?.entitlements_snapshot || {}, null, 2)}
                    </pre>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <Button onClick={openPortal} variant="outline">
                      Abrir portal de cobrança
                    </Button>
                    <Button
                      onClick={() => toast.message("Para trocar de plano, use a aba Planos e inicie um novo checkout.")}
                      variant="ghost"
                    >
                      Como trocar de plano?
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="faturas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Faturas</CardTitle>
              <CardDescription>Últimas faturas registradas no provedor (ex.: Stripe).</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-sm text-muted-foreground">Carregando…</div>
              ) : invoices.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Nenhuma fatura encontrada (ou provedor desabilitado / sem permissão).
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Número</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.number || inv.id}</TableCell>
                          <TableCell>{inv.status || "—"}</TableCell>
                          <TableCell>{formatDateFromUnix(inv.created)}</TableCell>
                          <TableCell>{formatMoneyMinor(inv.amount_due ?? inv.amount_paid, inv.currency)}</TableCell>
                          <TableCell className="text-right">
                            {inv.hosted_invoice_url ? (
                              <a className="underline text-sm" href={inv.hosted_invoice_url} target="_blank" rel="noreferrer">
                                Abrir
                              </a>
                            ) : inv.invoice_pdf ? (
                              <a className="underline text-sm" href={inv.invoice_pdf} target="_blank" rel="noreferrer">
                                PDF
                              </a>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
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

        <TabsContent value="planos" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Checkout</CardTitle>
              <CardDescription>Selecione o plano que atende seu nível de maturidade NR‑1 e volume de colaboradores.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-2 max-w-md">
                <Label htmlFor="affiliate">Código de afiliado (opcional)</Label>
                <Input
                  id="affiliate"
                  value={affiliateCode}
                  onChange={(e) => setAffiliateCode(e.target.value)}
                  placeholder="Ex.: JOAO-CONTADOR"
                />
                <div className="text-xs text-muted-foreground">
                  Se você recebeu um código, insira aqui para aplicar desconto e registrar a indicação.
                </div>
              </div>

              <Separator />

              {loading ? (
                <div className="text-sm text-muted-foreground">Carregando planos…</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {plans.map((p) => {
                    const isCurrent = !!currentPlan && currentPlan.id === p.id;
                    return (
                      <Card key={p.id} className={isCurrent ? "border-primary" : ""}>
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <span>{p.name}</span>
                            {isCurrent ? <Badge>Atual</Badge> : null}
                          </CardTitle>
                          <CardDescription>{p.key}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="text-xs text-muted-foreground">
                            <div className="font-medium text-foreground">Recursos</div>
                            <pre className="mt-1 rounded-md border bg-muted/20 p-2 text-[10px] overflow-auto">
{JSON.stringify(p.features || {}, null, 2)}
                            </pre>
                          </div>
                          <Button className="w-full" onClick={() => startCheckout(p.key)} disabled={isCurrent}>
                            {isCurrent ? "Plano atual" : "Assinar / Alterar"}
                          </Button>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
