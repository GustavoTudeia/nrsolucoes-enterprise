"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { createCampaign, openCampaign, closeCampaign, listCampaigns } from "@/lib/api/campaigns";
import { listUnits } from "@/lib/api/org";
import { listTemplates, listVersions, type QuestionnaireTemplateDetailOut, type QuestionnaireVersionDetailOut } from "@/lib/api/questionnaires";
import {
  generateInvitations,
  listInvitations,
  getInvitationStats,
  revokeInvitations,
  downloadInvitationsCsv,
  copyInvitationLinks,
  type InvitationOut,
  type InvitationWithTokenOut,
  type InvitationStatsOut,
} from "@/lib/api/invitations";
import { useConsole } from "@/components/console/console-provider";
import type { CampaignDetailOut, OrgUnitOut } from "@/lib/api/types";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Download,
  FileText,
  Link2,
  MessageSquare,
  Search,
  Send,
  Ticket,
  Users,
  XCircle,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Rascunho", color: "bg-slate-100 text-slate-700", icon: Clock },
  open: { label: "Aberta", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  closed: { label: "Encerrada", color: "bg-blue-100 text-blue-700", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: "bg-muted text-muted-foreground", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function InvitationStatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; icon: any; label: string }> = {
    pending: { variant: "outline", icon: Clock, label: "Pendente" },
    used: { variant: "default", icon: CheckCircle2, label: "Respondido" },
    expired: { variant: "secondary", icon: AlertTriangle, label: "Expirado" },
    revoked: { variant: "destructive", icon: XCircle, label: "Revogado" },
  };
  const { variant, icon: Icon, label } = config[status] || config.pending;
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

// =============================================================================
// INVITATION MANAGEMENT DIALOG
// =============================================================================

function InvitationDialog({
  open,
  onClose,
  campaign,
  units,
}: {
  open: boolean;
  onClose: () => void;
  campaign: CampaignDetailOut | null;
  units: OrgUnitOut[];
}) {
  const [tab, setTab] = useState<"generate" | "list" | "stats">("generate");
  const [loading, setLoading] = useState(false);

  // Generate state
  const [orgUnitId, setOrgUnitId] = useState<string>("");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [generatedInvitations, setGeneratedInvitations] = useState<InvitationWithTokenOut[]>([]);
  const [generateResult, setGenerateResult] = useState<{
    total_eligible: number;
    total_created: number;
    total_skipped: number;
  } | null>(null);

  // List state
  const [invitations, setInvitations] = useState<InvitationOut[]>([]);
  const [invitationsTotal, setInvitationsTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Stats state
  const [stats, setStats] = useState<InvitationStatsOut | null>(null);

  const campaignId = campaign?.id;

  async function loadInvitations() {
    if (!campaignId) return;
    setLoading(true);
    try {
      const r = await listInvitations(campaignId, {
        status: statusFilter || undefined,
        limit: 100,
      });
      setInvitations(r.items);
      setInvitationsTotal(r.total);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar convites");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    if (!campaignId) return;
    setLoading(true);
    try {
      const r = await getInvitationStats(campaignId);
      setStats(r);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar estatísticas");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && campaignId) {
      if (tab === "list") loadInvitations();
      if (tab === "stats") loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignId, tab, statusFilter]);

  async function handleGenerate() {
    if (!campaignId) return;
    setLoading(true);
    try {
      const result = await generateInvitations(campaignId, {
        org_unit_id: orgUnitId || undefined,
        expires_in_days: expiresInDays,
        send_email: false,
      });
      setGeneratedInvitations(result.invitations);
      setGenerateResult({
        total_eligible: result.total_eligible,
        total_created: result.total_created,
        total_skipped: result.total_skipped,
      });
      toast.success(`${result.total_created} convite(s) gerado(s)!`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar convites");
    } finally {
      setLoading(false);
    }
  }

  async function handleDownloadCsv() {
    if (!campaign || generatedInvitations.length === 0) return;
    downloadInvitationsCsv(generatedInvitations, campaign.name);
    toast.success("CSV baixado!");
  }

  async function handleCopyLinks() {
    if (generatedInvitations.length === 0) return;
    try {
      await copyInvitationLinks(generatedInvitations);
      toast.success("Links copiados para a área de transferência!");
    } catch {
      toast.error("Falha ao copiar links");
    }
  }

  async function handleRevoke(invitationId: string) {
    if (!campaignId) return;
    if (!confirm("Tem certeza que deseja revogar este convite?")) return;
    try {
      await revokeInvitations(campaignId, {
        invitation_ids: [invitationId],
        reason: "Revogado manualmente",
      });
      toast.success("Convite revogado");
      loadInvitations();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao revogar");
    }
  }

  function resetGenerate() {
    setGeneratedInvitations([]);
    setGenerateResult(null);
    setOrgUnitId("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            Gerenciar Convites
          </DialogTitle>
          <DialogDescription>
            {campaign?.name} • Convites garantem 1 resposta por colaborador (LGPD-compliant)
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(t) => setTab(t as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="generate" className="gap-2">
              <Send className="h-4 w-4" />
              Gerar
            </TabsTrigger>
            <TabsTrigger value="list" className="gap-2">
              <Users className="h-4 w-4" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Estatísticas
            </TabsTrigger>
          </TabsList>

          {/* TAB: GERAR CONVITES */}
          <TabsContent value="generate" className="space-y-4 mt-4">
            {generatedInvitations.length === 0 ? (
              <>
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="font-medium">Como funciona:</div>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
                    <li>Cada colaborador recebe um <strong>token único</strong></li>
                    <li>O token só pode ser usado <strong>uma vez</strong></li>
                    <li>A resposta é <strong>anônima</strong> (não vinculada ao colaborador)</li>
                    <li>Distribua os links por email, intranet ou comunicado interno</li>
                  </ul>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Filtrar por Unidade/Setor</Label>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={orgUnitId}
                      onChange={(e) => setOrgUnitId(e.target.value)}
                    >
                      <option value="">Todos os colaboradores do CNPJ</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Validade do convite (dias)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={90}
                      value={expiresInDays}
                      onChange={(e) => setExpiresInDays(Number(e.target.value))}
                    />
                  </div>
                </div>

                <Button onClick={handleGenerate} disabled={loading} className="w-full">
                  {loading ? "Gerando..." : "Gerar Convites para Colaboradores"}
                </Button>
              </>
            ) : (
              <>
                {/* Resultado da geração */}
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-700 font-medium">
                    <CheckCircle2 className="h-5 w-5" />
                    Convites gerados com sucesso!
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Elegíveis</div>
                      <div className="text-lg font-semibold">{generateResult?.total_eligible}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Criados</div>
                      <div className="text-lg font-semibold text-emerald-600">{generateResult?.total_created}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Já tinham</div>
                      <div className="text-lg font-semibold text-amber-600">{generateResult?.total_skipped}</div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleDownloadCsv} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Baixar CSV
                  </Button>
                  <Button onClick={handleCopyLinks} variant="outline" className="gap-2">
                    <Copy className="h-4 w-4" />
                    Copiar Links
                  </Button>
                  <Button onClick={resetGenerate} variant="secondary">
                    Gerar Mais
                  </Button>
                </div>

                <div className="rounded-lg border max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Colaborador</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Link</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {generatedInvitations.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.employee_name || "-"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{inv.employee_email || "-"}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="gap-1 text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(inv.survey_url);
                                toast.success("Link copiado!");
                              }}
                            >
                              <Link2 className="h-3 w-3" />
                              Copiar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                  <strong>Importante:</strong> Os tokens acima são exibidos apenas uma vez. 
                  Baixe o CSV ou copie os links antes de fechar esta janela.
                </div>
              </>
            )}
          </TabsContent>

          {/* TAB: LISTA DE CONVITES */}
          <TabsContent value="list" className="space-y-4 mt-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <select
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">Todos os status</option>
                  <option value="pending">Pendentes</option>
                  <option value="used">Respondidos</option>
                  <option value="expired">Expirados</option>
                  <option value="revoked">Revogados</option>
                </select>
              </div>
              <Button size="sm" variant="outline" onClick={loadInvitations}>
                Atualizar
              </Button>
            </div>

            <div className="text-sm text-muted-foreground">
              {invitationsTotal} convite(s) encontrado(s)
            </div>

            <div className="rounded-lg border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expira</TableHead>
                    <TableHead>Respondido</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : invitations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-muted-foreground">
                        Nenhum convite encontrado. Gere convites na aba "Gerar".
                      </TableCell>
                    </TableRow>
                  ) : (
                    invitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <div className="font-medium">{inv.employee_name || "-"}</div>
                          <div className="text-xs text-muted-foreground">{inv.employee_email}</div>
                        </TableCell>
                        <TableCell>
                          <InvitationStatusBadge status={inv.status} />
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(inv.expires_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {inv.used_at ? new Date(inv.used_at).toLocaleString("pt-BR") : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {inv.status === "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleRevoke(inv.id)}
                            >
                              Revogar
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* TAB: ESTATÍSTICAS */}
          <TabsContent value="stats" className="space-y-4 mt-4">
            {loading ? (
              <div className="text-muted-foreground">Carregando estatísticas...</div>
            ) : stats ? (
              <>
                {/* Cards de resumo */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold">{stats.total_invitations}</div>
                      <div className="text-xs text-muted-foreground">Total de convites</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-emerald-600">{stats.total_used}</div>
                      <div className="text-xs text-muted-foreground">Respondidos</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-amber-600">{stats.total_pending}</div>
                      <div className="text-xs text-muted-foreground">Pendentes</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-2xl font-bold text-red-600">
                        {stats.total_expired + stats.total_revoked}
                      </div>
                      <div className="text-xs text-muted-foreground">Exp./Revogados</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Taxa de resposta */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Taxa de Resposta</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>{stats.total_used} de {stats.total_invitations} colaboradores</span>
                      <span className="font-semibold">{(stats.response_rate * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={stats.response_rate * 100} className="h-3" />
                  </CardContent>
                </Card>

                {/* Por unidade */}
                {stats.by_org_unit && stats.by_org_unit.length > 0 && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Por Unidade/Setor</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {stats.by_org_unit.map((unit, idx) => {
                          const rate = unit.invited > 0 ? (unit.responded / unit.invited) * 100 : 0;
                          return (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span>{unit.org_unit_name}</span>
                                <span className="text-muted-foreground">
                                  {unit.responded}/{unit.invited} ({rate.toFixed(0)}%)
                                </span>
                              </div>
                              <Progress value={rate} className="h-2" />
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-muted-foreground">Nenhuma estatística disponível</div>
            )}

            <Button size="sm" variant="outline" onClick={loadStats}>
              Atualizar Estatísticas
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function CampanhasPage() {
  const { scope } = useConsole();

  const [name, setName] = useState("Campanha NR-1 – Governança e Evidências");
  const [unitId, setUnitId] = useState<string>("");

  const [units, setUnits] = useState<OrgUnitOut[]>([]);
  const [templates, setTemplates] = useState<QuestionnaireTemplateDetailOut[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [versions, setVersions] = useState<QuestionnaireVersionDetailOut[]>([]);
  const [versionId, setVersionId] = useState<string>("");

  const [campaigns, setCampaigns] = useState<CampaignDetailOut[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialog de convites
  const [invitationDialogOpen, setInvitationDialogOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignDetailOut | null>(null);

  async function refreshCampaigns() {
    setLoading(true);
    try {
      const r = await listCampaigns({ limit: 200, offset: 0, cnpj_id: scope.cnpjId || undefined });
      setCampaigns(r.items);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar campanhas");
    } finally {
      setLoading(false);
    }
  }

  async function refreshUnits() {
    try {
      if (!scope.cnpjId) {
        setUnits([]);
        setUnitId("");
        return;
      }
      const u = await listUnits(scope.cnpjId);
      setUnits(u);
      if (unitId && !u.some((x) => x.id === unitId)) setUnitId("");
    } catch {
      setUnits([]);
    }
  }

  async function refreshTemplates() {
    try {
      const r = await listTemplates({ limit: 200, offset: 0, is_active: true });
      setTemplates(r.items);
      if (!templateId && r.items[0]?.id) setTemplateId(r.items[0].id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar templates");
    }
  }

  async function refreshVersions(tid: string) {
    if (!tid) {
      setVersions([]);
      setVersionId("");
      return;
    }
    try {
      const r = await listVersions(tid, { published_only: true, limit: 200, offset: 0 });
      setVersions(r.items);
      if (!versionId && r.items[0]?.id) setVersionId(r.items[0].id);
      if (versionId && !r.items.some((v) => v.id === versionId)) setVersionId(r.items[0]?.id || "");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar versões");
      setVersions([]);
      setVersionId("");
    }
  }

  useEffect(() => {
    refreshCampaigns();
    refreshUnits();
    refreshTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.cnpjId]);

  useEffect(() => {
    if (templateId) refreshVersions(templateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const unitOptions = useMemo(() => units.map((u) => ({ id: u.id, label: `${u.name} (${u.unit_type})` })), [units]);
  const templateOptions = useMemo(
    () => templates.map((t) => ({ id: t.id, label: `${t.name}${t.is_platform_managed ? " • oficial" : ""}` })),
    [templates]
  );
  const versionOptions = useMemo(() => versions.map((v) => ({ id: v.id, label: `v${v.version} • ${v.status}` })), [versions]);

  async function onCreate() {
    try {
      if (!scope.cnpjId) throw new Error("Selecione um CNPJ no topo");
      if (!versionId) throw new Error("Selecione uma versão publicada de questionário");

      await createCampaign({
        name,
        cnpj_id: scope.cnpjId,
        org_unit_id: unitId || undefined,
        questionnaire_version_id: versionId,
      });
      toast.success("Campanha criada");
      await refreshCampaigns();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar");
    }
  }

  async function onOpen(id: string) {
    try {
      await openCampaign(id);
      toast.success("Campanha aberta");
      await refreshCampaigns();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao abrir");
    }
  }

  async function onClose(id: string) {
    try {
      await closeCampaign(id);
      toast.success("Campanha encerrada");
      await refreshCampaigns();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao encerrar");
    }
  }

  function openInvitationDialog(campaign: CampaignDetailOut) {
    setSelectedCampaign(campaign);
    setInvitationDialogOpen(true);
  }

  const openCount = campaigns.filter((c) => c.status === "open").length;
  const draftCount = campaigns.filter((c) => c.status === "draft").length;
  const closedCount = campaigns.filter((c) => c.status === "closed").length;
  const totalResponses = campaigns.reduce((a, c) => a + (c.response_count || 0), 0);

  const [searchTerm, setSearchTerm] = useState("");
  const filteredCampaigns = useMemo(() => {
    if (!searchTerm.trim()) return campaigns;
    const s = searchTerm.toLowerCase();
    return campaigns.filter((c) => c.name.toLowerCase().includes(s) || (c.org_unit_name || "").toLowerCase().includes(s));
  }, [campaigns, searchTerm]);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Campanhas"
        description="Governança/evidências NR-1: crie campanhas, gere convites controlados e acompanhe respostas com LGPD."
      />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2.5"><ClipboardList className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">{campaigns.length}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2.5"><CheckCircle2 className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-2xl font-bold">{openCount}</p>
                <p className="text-sm text-muted-foreground">Aberta{openCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-slate-100 p-2.5"><Clock className="h-5 w-5 text-slate-600" /></div>
              <div>
                <p className="text-2xl font-bold">{draftCount}</p>
                <p className="text-sm text-muted-foreground">Rascunho{draftCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2.5"><MessageSquare className="h-5 w-5 text-violet-600" /></div>
              <div>
                <p className="text-2xl font-bold">{totalResponses}</p>
                <p className="text-sm text-muted-foreground">Resposta{totalResponses !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create form */}
      <Card>
        <CardHeader>
          <CardTitle>Criar campanha</CardTitle>
          <CardDescription>Campanhas sao a base do diagnostico. Use convites para garantir participacao controlada.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="lg:col-span-2 space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Setor (opcional)</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!scope.cnpjId}>
                <option value="">(CNPJ inteiro)</option>
                {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Instrumento</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                <option value="">Selecione</option>
                {templateOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Versao</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={versionId} onChange={(e) => setVersionId(e.target.value)} disabled={!templateId}>
                <option value="">Selecione</option>
                {versionOptions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <Button onClick={onCreate} disabled={!scope.cnpjId || !versionId || !name}>Criar campanha</Button>
        </CardContent>
      </Card>

      {/* Campaign list */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle>Campanhas</CardTitle>
              <CardDescription>{loading ? "Carregando..." : `${filteredCampaigns.length} campanha(s)`}</CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9 w-56" placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" onClick={refreshCampaigns}>Atualizar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filteredCampaigns.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>{searchTerm ? "Nenhuma campanha encontrada." : "Nenhuma campanha criada."}</p>
            </div>
          ) : (
            filteredCampaigns.map((c) => (
              <div key={c.id} className="rounded-lg border p-4 space-y-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name}</span>
                      <StatusBadge status={c.status} />
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3" />
                        {c.response_count || 0} resposta{(c.response_count || 0) !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.org_unit_name ? `Setor: ${c.org_unit_name}` : "Escopo: CNPJ inteiro"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Criada: {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      {c.opened_at ? ` · Aberta: ${new Date(c.opened_at).toLocaleDateString("pt-BR")}` : ""}
                      {c.closed_at ? ` · Encerrada: ${new Date(c.closed_at).toLocaleDateString("pt-BR")}` : ""}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {c.status === "draft" && <Button size="sm" onClick={() => onOpen(c.id)}>Abrir</Button>}
                    {c.status === "open" && <Button variant="secondary" size="sm" onClick={() => onClose(c.id)}>Encerrar</Button>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => openInvitationDialog(c)}>
                    <Ticket className="h-3.5 w-3.5" /> Convites
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <a href={`/pesquisa/${c.id}`} target="_blank" rel="noreferrer"><Link2 className="h-3.5 w-3.5" /> Pesquisa</a>
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1" asChild>
                    <a href="/resultados"><BarChart3 className="h-3.5 w-3.5" /> Resultados</a>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <InvitationDialog
        open={invitationDialogOpen}
        onClose={() => setInvitationDialogOpen(false)}
        campaign={selectedCampaign}
        units={units}
      />
    </div>
  );
}
