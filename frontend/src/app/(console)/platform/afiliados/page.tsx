"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createAffiliate, listAffiliates, listLedger, createPayout, markPayoutPaid } from "@/lib/api/affiliates";
import type { AffiliateOut, LedgerOut, PayoutOut } from "@/lib/api/types";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";

export default function PlatformAfiliadosPage() {
  const { me } = useConsole();
  const [affiliates, setAffiliates] = useState<AffiliateOut[]>([]);
  const [ledger, setLedger] = useState<LedgerOut[]>([]);

  const [code, setCode] = useState("JOAO123");
  const [name, setName] = useState("João Contador");
  const [email, setEmail] = useState("joao@contador.com.br");
  const [discount, setDiscount] = useState(5);
  const [commission, setCommission] = useState(10);

  const [payoutAffiliateId, setPayoutAffiliateId] = useState("");
  const [payoutAmount, setPayoutAmount] = useState<number>(0);
  const [payoutMethod, setPayoutMethod] = useState("pix");
  const [payoutRef, setPayoutRef] = useState("");

  async function refresh() {
    try {
      const [a, l] = await Promise.all([listAffiliates(), listLedger()]);
      setAffiliates(a);
      setLedger(l);
      if (!payoutAffiliateId && a[0]?.id) setPayoutAffiliateId(a[0].id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar afiliados");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  if (!me?.is_platform_admin) {
    return (
      <div className="container py-8">
        <div className="text-lg font-semibold">Acesso restrito</div>
        <div className="mt-2 text-sm text-muted-foreground">A área de afiliados (admin) é exclusiva do administrador da plataforma.</div>
      </div>
    );
  }

  async function onCreateAffiliate() {
    try {
      const r = await createAffiliate({ code, name, email, discount_percent: discount, commission_percent: commission });
      toast.success("Afiliado criado");
      await refresh();
      alert(`Afiliado criado. Código: ${r.code}`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar afiliado");
    }
  }

  async function onCreatePayout() {
    try {
      const r = await createPayout(payoutAffiliateId, { amount: payoutAmount, method: payoutMethod, reference: payoutRef || undefined });
      toast.success("Payout criado");
      alert(`Payout ID: ${r.id}`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar payout");
    }
  }

  async function onMarkPaid(payoutId: string) {
    try {
      const r = await markPayoutPaid(payoutId);
      toast.success("Payout marcado como pago");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao marcar payout");
    }
  }

  return (
    <div className="container py-8 space-y-6">
      <PageHeader title="Afiliados (Admin)" description="Cadastro, ledger de comissões e payouts." />

      <Tabs defaultValue="afiliados">
        <TabsList>
          <TabsTrigger value="afiliados">Afiliados</TabsTrigger>
          <TabsTrigger value="ledger">Ledger</TabsTrigger>
          <TabsTrigger value="payouts">Payouts</TabsTrigger>
        </TabsList>

        <TabsContent value="afiliados">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Criar afiliado</CardTitle>
                <CardDescription>Código único para tracking e benefício ao indicado.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input value={code} onChange={(e) => setCode(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Desconto indicado (%)</Label>
                    <Input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Comissão afiliado (%)</Label>
                    <Input type="number" value={commission} onChange={(e) => setCommission(Number(e.target.value))} />
                  </div>
                </div>
                <Button onClick={onCreateAffiliate} disabled={!code || !name}>Criar</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Lista</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Desconto</TableHead>
                      <TableHead>Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {affiliates.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-muted-foreground">Nenhum afiliado.</TableCell></TableRow>
                    ) : (
                      affiliates.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell>{a.code}</TableCell>
                          <TableCell>{a.discount_percent}%</TableCell>
                          <TableCell>{a.commission_percent}%</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle>Ledger</CardTitle>
              <CardDescription>Registros de comissão por invoice (gerados por webhook do provedor).</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Affiliate</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Net</TableHead>
                    <TableHead>Commission</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nenhum registro.</TableCell></TableRow>
                  ) : (
                    ledger.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs text-muted-foreground">{l.affiliate_id}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{l.provider_invoice_id}</TableCell>
                        <TableCell>{l.net_amount}</TableCell>
                        <TableCell>{l.commission_amount}</TableCell>
                        <TableCell>{l.status}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <CardTitle>Criar payout</CardTitle>
              <CardDescription>Em produção, recomenda-se workflow de aprovação e integração com PSP/banco.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label>Afiliado</Label>
                <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={payoutAffiliateId} onChange={(e) => setPayoutAffiliateId(e.target.value)}>
                  {affiliates.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" value={payoutAmount} onChange={(e) => setPayoutAmount(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Método</Label>
                <Input value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} placeholder="pix" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Referência (opcional)</Label>
                <Input value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder="txid / comprovante / observação" />
              </div>
              <div className="md:col-span-3">
                <Button onClick={onCreatePayout} disabled={!payoutAffiliateId || payoutAmount <= 0}>Criar payout</Button>
              </div>

              <div className="md:col-span-3 text-xs text-muted-foreground">
                Para marcar como pago, use o endpoint /affiliates/payouts/&lt;payout_id&gt;/mark-paid (já exposto no backend).
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="rounded-xl border bg-muted/20 p-5 text-xs text-muted-foreground">
        Sugestão enterprise: implementar dashboard do afiliado (self-service) com métricas, leads, conversões e extrato, além de antifraude (códigos, domínio, validações).
      </div>
    </div>
  );
}
