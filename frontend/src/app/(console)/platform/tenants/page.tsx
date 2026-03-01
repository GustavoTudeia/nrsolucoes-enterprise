"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import { createTenant, listPlatformPlans, listTenants, setTenantPlan, type TenantOut, type PlanAdminOut } from "@/lib/api/tenants";

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export default function PlatformTenantsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  const [tenants, setTenants] = useState<TenantOut[]>([]);
  const [plans, setPlans] = useState<PlanAdminOut[]>([]);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [q, setQ] = useState("");

  async function refresh() {
    try {
      const [t, p] = await Promise.all([listTenants(q || undefined, 100, 0), listPlatformPlans()]);
      setTenants(t.items || []);
      setPlans(p || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar tenants", description: err?.detail || err?.message || "" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreateTenant() {
    try {
      if (!name.trim()) throw new Error("Informe o nome");
      const finalSlug = (slug || slugify(name)).trim();
      await createTenant({ name: name.trim(), slug: finalSlug || null });
      toast({ title: "Tenant criado", description: "Pack NR-1 aplicado automaticamente (quando habilitado)." });
      setName("");
      setSlug("");
      await refresh();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.detail || err?.message || "" });
    }
  }

  async function onSetPlan(tenantId: string, planKey: string) {
    try {
      await setTenantPlan(tenantId, planKey);
      toast({ title: "Plano atualizado", description: `Novo plano: ${planKey}` });
      await refresh();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar plano", description: err?.detail || err?.message || "" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Plataforma • Tenants" subtitle="Criar tenants e gerenciar planos." />

      <Card>
        <CardHeader>
          <CardTitle>Novo tenant</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Empresa XPTO" />
            </div>
            <div>
              <Label>Slug (opcional)</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="empresa-xpto" />
            </div>
          </div>
          <Button onClick={onCreateTenant}>Criar</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label>Buscar</Label>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nome ou slug..." />
            </div>
            <Button variant="outline" onClick={refresh}>
              Filtrar
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Plano</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.slug || "-"}</TableCell>
                  <TableCell>
                    <select
                      className="border rounded-md h-9 px-2"
                      value={t.plan_key || ""}
                      onChange={(e) => onSetPlan(t.id, e.target.value)}
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {plans
                        .filter((p) => p.is_active)
                        .map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.key} • {p.name}
                          </option>
                        ))}
                    </select>
                  </TableCell>
                  <TableCell className="text-sm">{t.subscription_status || "-"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{t.id}</TableCell>
                </TableRow>
              ))}
              {!tenants.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    {loading ? "Carregando..." : "Nenhum tenant encontrado."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
