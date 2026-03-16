"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { trackBrowserEvent } from "@/lib/analytics/client";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listPlans,
  getSubscription,
  createCheckoutSession,
  createPortalSession,
  listInvoices,
  getBillingProfile,
  updateBillingProfile,
  getBillingOnboarding,
  resendInvoiceEmail,
  requestInvoiceIssue,
} from "@/lib/api/billing";
import type { BillingProfileOut, InvoiceOut, OnboardingOverviewOut, PlanOut, SubscriptionOut } from "@/lib/api/types";

function formatBRL(cents?: number | null, currency?: string | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: (currency || "BRL").toUpperCase() }).format((cents || 0) / 100);
}

function fmtDate(value?: string | null | number) {
  if (!value) return "—";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return date.toLocaleDateString("pt-BR");
}

const REQUIRED_FIELDS = [
  "legal_name",
  "cnpj_number",
  "finance_email",
  "address_street",
  "address_number",
  "address_district",
  "city",
  "state",
  "postal_code",
] as const;

export default function BillingPage() {
  const [plans, setPlans] = useState<PlanOut[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionOut | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOut[]>([]);
  const [profile, setProfile] = useState<BillingProfileOut | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingOverviewOut | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const missing = useMemo(() => {
    if (!profile) return REQUIRED_FIELDS as readonly string[];
    return REQUIRED_FIELDS.filter((key) => {
      const value = profile[key as keyof BillingProfileOut];
      return value == null || String(value).trim() === "";
    });
  }, [profile]);

  async function refresh() {
    try {
      const [nextPlans, nextSubscription, nextInvoices, nextProfile, nextOnboarding] = await Promise.all([
        listPlans(),
        getSubscription(),
        listInvoices(),
        getBillingProfile(),
        getBillingOnboarding(),
      ]);
      setPlans(nextPlans);
      setSubscription(nextSubscription);
      setInvoices(nextInvoices);
      setProfile(nextProfile);
      setOnboarding(nextOnboarding);
      if ((nextSubscription.billing_cycle as any) === "annual") setBillingPeriod("annual");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar billing");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    trackBrowserEvent("console", { event_name: "billing_page_viewed", source: "console", module: "billing" });
  }, []);

  async function handleCheckout(planKey: string) {
    try {
      await trackBrowserEvent("console", {
        event_name: "billing_checkout_clicked",
        source: "console",
        module: "billing",
        properties: { plan_key: planKey, billing_period: billingPeriod },
      });
      const { checkout_url } = await createCheckoutSession(planKey, billingPeriod);
      window.location.href = checkout_url;
    } catch (e: any) {
      toast.error(e?.message || "Falha ao iniciar checkout");
    }
  }

  async function handleSaveProfile() {
    if (!profile) return;
    try {
      setSaving(true);
      await updateBillingProfile(profile);
      toast.success("Perfil de faturamento salvo");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar perfil");
    } finally {
      setSaving(false);
    }
  }

  async function handlePortal() {
    try {
      await trackBrowserEvent("console", { event_name: "billing_portal_clicked", source: "console", module: "billing" });
      const { url } = await createPortalSession();
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || "Falha ao abrir portal de pagamentos");
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader title="Assinatura, Faturamento e Onboarding" description="Controle o ciclo comercial ponta a ponta: plano, pagamento, dados fiscais e documentos financeiros." />

      <Card>
        <CardHeader>
          <CardTitle>Onboarding executivo</CardTitle>
          <CardDescription>O caminho enterprise: perfil fiscal completo, pagamento ativo e operação básica implantada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : onboarding ? (
            <>
              <div className="flex items-center gap-4 justify-between">
                <div>
                  <div className="text-3xl font-bold">{onboarding.progress_percent}%</div>
                  <div className="text-sm text-muted-foreground">{onboarding.status === "completed" ? "Implantação concluída" : "Implantação em andamento"}</div>
                </div>
                <div className="w-full max-w-md"><Progress value={onboarding.progress_percent} /></div>
                <Button asChild variant="outline"><Link href="/onboarding">Abrir checklist</Link></Button>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                {onboarding.steps.slice(0, 3).map((step) => (
                  <div key={step.key} className="rounded-lg border p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{step.title}</div>
                      <Badge variant="outline">{step.status}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">{step.description}</div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid xl:grid-cols-[1.05fr_.95fr] gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Perfil de faturamento</CardTitle>
            <CardDescription>Dados que sustentam cobrança, emissão de NFS-e e comunicação financeira.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {profile ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2"><Label>Razão social *</Label><Input value={profile.legal_name || ""} onChange={(e) => setProfile({ ...profile, legal_name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Nome fantasia</Label><Input value={profile.trade_name || ""} onChange={(e) => setProfile({ ...profile, trade_name: e.target.value })} /></div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>CNPJ *</Label><Input value={profile.cnpj_number || ""} onChange={(e) => setProfile({ ...profile, cnpj_number: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Inscrição estadual</Label><Input value={profile.state_registration || ""} onChange={(e) => setProfile({ ...profile, state_registration: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Inscrição municipal</Label><Input value={profile.municipal_registration || ""} onChange={(e) => setProfile({ ...profile, municipal_registration: e.target.value })} /></div>
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2"><Label>Email financeiro *</Label><Input value={profile.finance_email || ""} onChange={(e) => setProfile({ ...profile, finance_email: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Contato</Label><Input value={profile.contact_name || ""} onChange={(e) => setProfile({ ...profile, contact_name: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Telefone</Label><Input value={profile.contact_phone || ""} onChange={(e) => setProfile({ ...profile, contact_phone: e.target.value })} /></div>
                </div>
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="space-y-2 md:col-span-2"><Label>Logradouro *</Label><Input value={profile.address_street || ""} onChange={(e) => setProfile({ ...profile, address_street: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Número *</Label><Input value={profile.address_number || ""} onChange={(e) => setProfile({ ...profile, address_number: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Complemento</Label><Input value={profile.address_complement || ""} onChange={(e) => setProfile({ ...profile, address_complement: e.target.value })} /></div>
                </div>
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="space-y-2"><Label>Bairro *</Label><Input value={profile.address_district || ""} onChange={(e) => setProfile({ ...profile, address_district: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Cidade *</Label><Input value={profile.city || ""} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></div>
                  <div className="space-y-2"><Label>UF *</Label><Input value={profile.state || ""} maxLength={2} onChange={(e) => setProfile({ ...profile, state: e.target.value.toUpperCase() })} /></div>
                  <div className="space-y-2"><Label>CEP *</Label><Input value={profile.postal_code || ""} onChange={(e) => setProfile({ ...profile, postal_code: e.target.value })} /></div>
                </div>
                {missing.length > 0 ? (
                  <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800">Para liberar checkout e emissão fiscal, complete: {missing.join(", ")}</div>
                ) : (
                  <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 dark:bg-green-950 dark:text-green-200 dark:border-green-800">Perfil de faturamento completo.</div>
                )}
                <Button onClick={handleSaveProfile} disabled={saving}>{saving ? "Salvando..." : "Salvar perfil"}</Button>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plano e pagamento</CardTitle>
            <CardDescription>Escolha o ciclo de cobrança e avance para o checkout seguro.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant={billingPeriod === "monthly" ? "default" : "outline"} onClick={() => setBillingPeriod("monthly")}>Mensal</Button>
              <Button variant={billingPeriod === "annual" ? "default" : "outline"} onClick={() => setBillingPeriod("annual")}>Anual</Button>
              <Button variant="outline" onClick={handlePortal}>Portal Stripe</Button>
            </div>
            <div className="grid gap-4">
              {plans.map((plan) => {
                const isCurrent = plan.id === subscription?.plan_id;
                const price = billingPeriod === "annual" ? plan.price_annual ?? plan.price_monthly : plan.price_monthly;
                return (
                  <div key={plan.id} className={`rounded-xl border p-4 ${isCurrent ? "border-primary" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm text-muted-foreground uppercase">{plan.key}</div>
                        <div className="text-lg font-semibold">{plan.name}</div>
                        <div className="text-sm text-muted-foreground mt-1">{plan.is_custom_price ? "Sob consulta" : formatBRL(price)}</div>
                      </div>
                      {isCurrent ? <Badge>Plano atual</Badge> : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {Object.entries(plan.features || {}).filter(([, value]) => !!value).slice(0, 6).map(([key]) => <Badge key={key} variant="outline">{key}</Badge>)}
                    </div>
                    <div className="mt-4 flex gap-2">
                      {plan.is_custom_price ? (
                        <Button asChild variant="outline"><Link href="/contato">Falar com vendas</Link></Button>
                      ) : (
                        <Button onClick={() => handleCheckout(plan.key)} disabled={missing.length > 0}>Ir para checkout</Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Faturas e documentos</CardTitle>
          <CardDescription>Histórico local de cobranças, emissão fiscal e reenvio de comprovantes.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Referência</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead>Fiscal</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nenhuma fatura sincronizada até o momento.</TableCell></TableRow>
              ) : invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <div className="font-medium">{invoice.external_invoice_number || invoice.number || invoice.id}</div>
                    <div className="text-xs text-muted-foreground">{invoice.hosted_invoice_url ? "Stripe" : "Local"}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{invoice.status || "—"}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{invoice.fiscal_status || "—"}</Badge></TableCell>
                  <TableCell>{formatBRL(invoice.amount_paid ?? invoice.amount_due, invoice.currency)}</TableCell>
                  <TableCell>{fmtDate(invoice.emailed_at || invoice.created)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button size="sm" variant="outline" onClick={async () => { await requestInvoiceIssue(invoice.id); toast.success("Solicitação registrada"); refresh(); }}>Solicitar emissão</Button>
                    <Button size="sm" variant="outline" onClick={async () => { await resendInvoiceEmail(invoice.id); toast.success("Documento reenviado"); refresh(); }}>Reenviar</Button>
                    {invoice.fiscal_pdf_url || invoice.invoice_pdf || invoice.hosted_invoice_url ? (
                      <Button asChild size="sm" variant="outline"><a href={invoice.fiscal_pdf_url || invoice.invoice_pdf || invoice.hosted_invoice_url || "#"} target="_blank" rel="noreferrer">Abrir</a></Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
