"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";

import { listPlatformPlans, createPlan, updatePlan, type PlanAdminOut } from "@/lib/api/tenants";

const FEATURE_OPTIONS = [
  // Módulos core
  { key: "CAMPAIGNS", label: "Campanhas", group: "Módulos" },
  { key: "QUESTIONNAIRES", label: "Questionários", group: "Módulos" },
  { key: "LMS", label: "LMS / Treinamentos", group: "Módulos" },
  { key: "RISK_MAP", label: "Mapa de Risco", group: "Módulos" },
  { key: "ACTION_PLANS", label: "Plano de Ação", group: "Módulos" },
  { key: "REPORTS", label: "Relatórios", group: "Módulos" },
  // Conformidade
  { key: "ANONYMIZATION", label: "Anonimização LGPD", group: "Conformidade" },
  { key: "NR17", label: "NR-17 (Ergonomia)", group: "Conformidade" },
  { key: "ESOCIAL_EXPORT", label: "eSocial SST", group: "Conformidade" },
  { key: "AUDIT", label: "Auditoria", group: "Conformidade" },
  { key: "AUDIT_EXPORT", label: "Exportação de auditoria", group: "Conformidade" },
  // Infraestrutura
  { key: "MULTI_CNPJ", label: "Multi-CNPJ", group: "Infraestrutura" },
  { key: "WHITE_LABEL", label: "White-label / Branding", group: "Infraestrutura" },
  { key: "SSO_OIDC", label: "SSO (OIDC)", group: "Infraestrutura" },
  { key: "API_ACCESS", label: "Acesso via API", group: "Infraestrutura" },
  { key: "MULTI_TENANT_MANAGER", label: "Gestão multi-tenant", group: "Infraestrutura" },
];

const LIMIT_FIELDS = [
  { key: "cnpj_max", label: "CNPJs máx" },
  { key: "employees_max", label: "Colaboradores máx" },
  { key: "users_max", label: "Usuários máx" },
  { key: "campaigns_max", label: "Campanhas ativas máx" },
  { key: "storage_gb", label: "Armazenamento (GB)" },
  { key: "history_months", label: "Histórico (meses)" },
];

type FormState = {
  key: string;
  name: string;
  features: Record<string, boolean>;
  limits: Record<string, string>;
  price_monthly: string;
  price_annual: string;
  is_custom_price: boolean;
  stripe_price_id: string;
  stripe_price_id_monthly: string;
  stripe_price_id_annual: string;
  is_active: boolean;
};

const emptyForm: FormState = {
  key: "",
  name: "",
  features: {},
  limits: {},
  price_monthly: "",
  price_annual: "",
  is_custom_price: false,
  stripe_price_id: "",
  stripe_price_id_monthly: "",
  stripe_price_id_annual: "",
  is_active: true,
};

function formatBRL(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export default function PlatformPlanosPage() {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<PlanAdminOut[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const p = await listPlatformPlans();
      setPlans(p || []);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar planos");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  function startEdit(plan: PlanAdminOut) {
    setEditingId(plan.id);
    setForm({
      key: plan.key,
      name: plan.name,
      features: Object.fromEntries(
        FEATURE_OPTIONS.map(f => [f.key, !!plan.features[f.key]])
      ),
      limits: Object.fromEntries(
        LIMIT_FIELDS.map(l => [l.key, plan.limits[l.key] != null ? String(plan.limits[l.key]) : ""])
      ),
      price_monthly: plan.price_monthly != null ? String(plan.price_monthly / 100) : "",
      price_annual: plan.price_annual != null ? String(plan.price_annual / 100) : "",
      is_custom_price: plan.is_custom_price || false,
      stripe_price_id: plan.stripe_price_id || "",
      stripe_price_id_monthly: (plan as any).stripe_price_id_monthly || plan.stripe_price_id || "",
      stripe_price_id_annual: (plan as any).stripe_price_id_annual || "",
      is_active: plan.is_active,
    });
    setShowForm(true);
  }

  function startNew() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit() {
    if (!form.key.trim() || !form.name.trim()) {
      toast.error("Key e nome são obrigatórios");
      return;
    }

    const features: Record<string, boolean> = {};
    for (const f of FEATURE_OPTIONS) {
      features[f.key] = !!form.features[f.key];
    }

    const limits: Record<string, number> = {};
    for (const l of LIMIT_FIELDS) {
      const v = parseInt(form.limits[l.key] || "", 10);
      if (!isNaN(v) && v > 0) limits[l.key] = v;
    }

    // Converte reais para centavos
    const priceMonthly = form.price_monthly ? Math.round(parseFloat(form.price_monthly) * 100) : null;
    const priceAnnual = form.price_annual ? Math.round(parseFloat(form.price_annual) * 100) : null;

    setSaving(true);
    try {
      if (editingId) {
        await updatePlan(editingId, {
          name: form.name,
          features,
          limits,
          price_monthly: priceMonthly,
          price_annual: priceAnnual,
          is_custom_price: form.is_custom_price,
          stripe_price_id: form.stripe_price_id || null,
          stripe_price_id_monthly: form.stripe_price_id_monthly || null,
          stripe_price_id_annual: form.stripe_price_id_annual || null,
          is_active: form.is_active,
        });
        toast.success("Plano atualizado");
      } else {
        await createPlan({
          key: form.key,
          name: form.name,
          features,
          limits,
          price_monthly: priceMonthly,
          price_annual: priceAnnual,
          is_custom_price: form.is_custom_price,
          stripe_price_id: form.stripe_price_id || null,
          stripe_price_id_monthly: form.stripe_price_id_monthly || null,
          stripe_price_id_annual: form.stripe_price_id_annual || null,
          is_active: form.is_active,
        });
        toast.success("Plano criado");
      }
      closeForm();
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar plano");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(plan: PlanAdminOut) {
    try {
      await updatePlan(plan.id, { is_active: !plan.is_active });
      toast.success(plan.is_active ? "Plano desativado" : "Plano ativado");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao alterar status");
    }
  }

  const activePlans = plans.filter(p => p.is_active).length;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Planos"
        description="Gerencie os planos disponíveis na plataforma"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total</p>
            <p className="text-2xl font-bold mt-1">{plans.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ativos</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{activePlans}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Inativos</p>
            <p className="text-2xl font-bold mt-1 text-gray-500">{plans.length - activePlans}</p>
          </CardContent>
        </Card>
      </div>

      {/* Form card */}
      <Card>
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => {
            if (showForm) {
              closeForm();
            } else {
              startNew();
            }
          }}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {editingId ? "Editar Plano" : "Novo Plano"}
            </CardTitle>
            {showForm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {showForm && (
          <CardContent className="space-y-4">
            {/* Identificação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Key</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
                  placeholder="Ex.: ENTERPRISE"
                  disabled={!!editingId}
                />
              </div>
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex.: Enterprise"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Stripe Price ID (legado/fallback)</Label>
                <Input value={form.stripe_price_id} onChange={(e) => setForm({ ...form, stripe_price_id: e.target.value })} placeholder="price_..." />
              </div>
              <div className="space-y-2">
                <Label>Stripe Price ID Mensal</Label>
                <Input value={form.stripe_price_id_monthly} onChange={(e) => setForm({ ...form, stripe_price_id_monthly: e.target.value })} placeholder="price_monthly_..." />
              </div>
              <div className="space-y-2">
                <Label>Stripe Price ID Anual</Label>
                <Input value={form.stripe_price_id_annual} onChange={(e) => setForm({ ...form, stripe_price_id_annual: e.target.value })} placeholder="price_annual_..." />
              </div>
            </div>

            {/* Preços */}
            <div className="space-y-2">
              <Label>Preços</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Mensal (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price_monthly}
                    onChange={(e) => setForm({ ...form, price_monthly: e.target.value })}
                    placeholder="299.00"
                    disabled={form.is_custom_price}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Anual (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.price_annual}
                    onChange={(e) => setForm({ ...form, price_annual: e.target.value })}
                    placeholder="2999.00"
                    disabled={form.is_custom_price}
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.is_custom_price}
                      onChange={(e) => setForm({ ...form, is_custom_price: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    Sob consulta (sem preço fixo)
                  </label>
                </div>
              </div>
            </div>

            {/* Features checkboxes — agrupadas */}
            <div className="space-y-3">
              <Label>Features</Label>
              {(["Módulos", "Conformidade", "Infraestrutura"] as const).map((group) => {
                const items = FEATURE_OPTIONS.filter((f) => f.group === group);
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">{group}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {items.map((f) => (
                        <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!form.features[f.key]}
                            onChange={(e) =>
                              setForm({ ...form, features: { ...form.features, [f.key]: e.target.checked } })
                            }
                            className="rounded border-gray-300"
                          />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Limits inputs */}
            <div className="space-y-2">
              <Label>Limites</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {LIMIT_FIELDS.map((l) => (
                  <div key={l.key} className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{l.label}</Label>
                    <Input
                      type="number"
                      value={form.limits[l.key] || ""}
                      onChange={(e) =>
                        setForm({ ...form, limits: { ...form.limits, [l.key]: e.target.value } })
                      }
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label>Ativo</Label>
            </label>

            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar plano"}
              </Button>
              <Button variant="outline" onClick={closeForm}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Plans table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : plans.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhum plano cadastrado.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Key</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Mensal</TableHead>
                  <TableHead>Anual</TableHead>
                  <TableHead>Features</TableHead>
                  <TableHead>Limites</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell className="font-mono text-sm">{plan.key}</TableCell>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell className="text-sm">
                      {plan.is_custom_price ? (
                        <Badge variant="outline">Sob consulta</Badge>
                      ) : (
                        formatBRL(plan.price_monthly)
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {plan.is_custom_price ? "—" : formatBRL(plan.price_annual)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(plan.features || {})
                          .filter(([, v]) => !!v)
                          .map(([k]) => (
                            <Badge key={k} variant="secondary" className="text-[10px]">{k}</Badge>
                          ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Object.entries(plan.limits || {}).map(([k, v]) => (
                        <span key={k} className="mr-2">{k}: {v as number}</span>
                      ))}
                    </TableCell>
                    <TableCell>
                      <Badge className={plan.is_active
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }>
                        {plan.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="outline" size="sm" onClick={() => startEdit(plan)}>
                          <Pencil className="h-3 w-3 mr-1" />
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleActive(plan)}
                        >
                          {plan.is_active ? "Desativar" : "Ativar"}
                        </Button>
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
