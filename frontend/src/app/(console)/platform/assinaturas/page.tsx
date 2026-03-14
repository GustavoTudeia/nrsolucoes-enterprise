"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import {
  listPlatformSubscriptions,
  changeSubscriptionStatus,
  getSubscriptionStats,
} from "@/lib/api/subscriptions";
import type { SubscriptionAdminOut, SubscriptionStatsOut } from "@/lib/api/types";

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  active: { label: "Ativo", cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  trial: { label: "Trial", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  past_due: { label: "Inadimplente", cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  canceled: { label: "Cancelado", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  suspended: { label: "Suspenso", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
};

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function PlatformAssinaturasPage() {
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<SubscriptionAdminOut[]>([]);
  const [stats, setStats] = useState<SubscriptionStatsOut | null>(null);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  async function refresh() {
    try {
      const params: Record<string, any> = { limit: 100, offset: 0 };
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      if (q.trim()) params.q = q.trim();

      const [list, st] = await Promise.all([
        listPlatformSubscriptions(params),
        getSubscriptionStats(),
      ]);
      setSubs(list.items || []);
      setTotal(list.total || 0);
      setStats(st);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar assinaturas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [statusFilter]);

  async function handleSearch() {
    setLoading(true);
    await refresh();
  }

  async function handleStatusChange(tenantId: string, newStatus: string) {
    try {
      await changeSubscriptionStatus(tenantId, newStatus);
      toast.success(`Status alterado para ${STATUS_STYLE[newStatus]?.label || newStatus}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao alterar status");
    }
  }

  function getActions(sub: SubscriptionAdminOut) {
    const actions: { label: string; status: string; variant: "outline" | "destructive" }[] = [];
    switch (sub.status) {
      case "active":
      case "trial":
        actions.push({ label: "Suspender", status: "suspended", variant: "outline" });
        actions.push({ label: "Cancelar", status: "canceled", variant: "destructive" });
        break;
      case "suspended":
        actions.push({ label: "Reativar", status: "active", variant: "outline" });
        actions.push({ label: "Cancelar", status: "canceled", variant: "destructive" });
        break;
      case "past_due":
        actions.push({ label: "Suspender", status: "suspended", variant: "outline" });
        actions.push({ label: "Cancelar", status: "canceled", variant: "destructive" });
        break;
      case "canceled":
        actions.push({ label: "Reativar", status: "active", variant: "outline" });
        break;
    }
    return actions;
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <PageHeader
        title="Assinaturas"
        description="Visão geral das assinaturas de todos os tenants"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Ativas</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{stats?.by_status?.active || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Trial</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats?.by_status?.trial || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Inadimplentes</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{stats?.by_status?.past_due || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Canceladas</p>
            <p className="text-2xl font-bold mt-1 text-gray-500">{stats?.by_status?.canceled || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-end">
            <div className="space-y-2 w-48">
              <p className="text-xs font-medium text-muted-foreground">Status</p>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="past_due">Inadimplente</SelectItem>
                  <SelectItem value="suspended">Suspenso</SelectItem>
                  <SelectItem value="canceled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Buscar tenant</p>
              <div className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Nome do tenant..."
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button variant="outline" onClick={handleSearch}>Buscar</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : subs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Nenhuma assinatura encontrada.</div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground mb-3">{total} assinatura(s)</div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subs.map((sub) => {
                    const si = STATUS_STYLE[sub.status] || { label: sub.status, cls: "bg-gray-100 text-gray-600" };
                    const actions = getActions(sub);
                    return (
                      <TableRow key={sub.id}>
                        <TableCell className="font-medium">{sub.tenant_name}</TableCell>
                        <TableCell>{sub.plan_name || sub.plan_key || "—"}</TableCell>
                        <TableCell>
                          <Badge className={si.cls}>{si.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(sub.period_end)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {actions.map((a) => (
                              <Button
                                key={a.status}
                                variant={a.variant}
                                size="sm"
                                onClick={() => handleStatusChange(sub.tenant_id, a.status)}
                              >
                                {a.label}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
