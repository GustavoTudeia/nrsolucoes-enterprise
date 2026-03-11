"use client";

import { useEffect, useMemo, useState } from "react";
import { listCnpjs, listUnits } from "@/lib/api/org";
import EnrollmentsTab from "@/components/action-plan/EnrollmentsTab";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listAssessments } from "@/lib/api/risks";
import type { RiskAssessmentOut } from "@/lib/api/types";
import {
  createActionPlan, addActionItem, addEvidence, addComment, listActionPlans,
  listActionItems, updateActionItem, getActionItem, listAssignableUsers,
  uploadEvidenceFile, getEvidenceDownloadUrl,
  deleteActionItem as apiDeleteActionItem,
  deleteEvidence as apiDeleteEvidence,
  deleteComment as apiDeleteComment,
  updateComment as apiUpdateComment,
  type ActionPlanOut, type ActionItemOut, type ResponsibleUserInfo,
} from "@/lib/api/actionPlans";
import { listContents } from "@/lib/api/lms";
import { useConsole } from "@/components/console/console-provider";
import { AlertTriangle, Calendar, CheckCircle2, Clock, MessageSquare, Paperclip, Plus, TrendingUp, User, GraduationCap, Building2, ClipboardList, Users, Trash2, Send, Upload, Download, FileText, Link as LinkIcon, Search, Shield, Pencil, Filter, UsersRound } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  planned: { label: "Planejado", color: "bg-slate-100 text-slate-700" },
  in_progress: { label: "Em Execução", color: "bg-blue-100 text-blue-700" },
  done: { label: "Concluído", color: "bg-green-100 text-green-700" },
  blocked: { label: "Bloqueado", color: "bg-red-100 text-red-700" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: "Baixa", color: "bg-gray-100 text-gray-600" },
  medium: { label: "Média", color: "bg-yellow-100 text-yellow-700" },
  high: { label: "Alta", color: "bg-orange-100 text-orange-700" },
  critical: { label: "Crítica", color: "bg-red-100 text-red-700" },
};

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  educational: { label: "Educativa", icon: <GraduationCap className="h-3 w-3" /> },
  organizational: { label: "Organizacional", icon: <Building2 className="h-3 w-3" /> },
  administrative: { label: "Administrativa", icon: <ClipboardList className="h-3 w-3" /> },
  support: { label: "Apoio", icon: <Users className="h-3 w-3" /> },
};

const CONTROL_HIERARCHY_CONFIG: Record<string, { label: string; color: string }> = {
  elimination: { label: "Eliminação", color: "bg-emerald-100 text-emerald-700" },
  substitution: { label: "Substituição/Redução", color: "bg-teal-100 text-teal-700" },
  epc: { label: "EPC (Proteção Coletiva)", color: "bg-cyan-100 text-cyan-700" },
  administrative: { label: "Administrativo", color: "bg-indigo-100 text-indigo-700" },
  epi: { label: "EPI (Proteção Individual)", color: "bg-violet-100 text-violet-700" },
};

const TRAINING_TYPE_CONFIG: Record<string, { label: string }> = {
  initial: { label: "Inicial" },
  periodic: { label: "Periódico" },
  eventual: { label: "Eventual" },
};

const MONITORING_FREQUENCY_CONFIG: Record<string, { label: string }> = {
  weekly: { label: "Semanal" },
  monthly: { label: "Mensal" },
  quarterly: { label: "Trimestral" },
  semiannual: { label: "Semestral" },
  annual: { label: "Anual" },
};

const COLUMNS = [
  { key: "planned", label: "Planejado", icon: <Clock className="h-4 w-4" /> },
  { key: "in_progress", label: "Em Execução", icon: <TrendingUp className="h-4 w-4" /> },
  { key: "done", label: "Concluído", icon: <CheckCircle2 className="h-4 w-4" /> },
];

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.planned;
  return <Badge variant="outline" className={`${c.color} font-normal`}>{c.label}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const c = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  return <Badge variant="secondary" className={`${c.color} text-xs`}>{c.label}</Badge>;
}

export default function PlanoAcaoPage() {
  const { scope, me } = useConsole();
  const tenantSlug = me?.tenant?.slug || "";
  const [assessments, setAssessments] = useState<RiskAssessmentOut[]>([]);
  const [assessmentId, setAssessmentId] = useState("");
  const [orgUnits, setOrgUnits] = useState<Array<{ id: string; name: string }>>([]);
  const [cnpjsList, setCnpjsList] = useState<Array<{ id: string; legal_name: string; cnpj: string }>>([]);
  const [plans, setPlans] = useState<ActionPlanOut[]>([]);
  const [planId, setPlanId] = useState("");
  const [items, setItems] = useState<ActionItemOut[]>([]);
  const [selectedItem, setSelectedItem] = useState<ActionItemOut | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [users, setUsers] = useState<ResponsibleUserInfo[]>([]);
  const [contents, setContents] = useState<{ id: string; title: string }[]>([]);

  // Form states
  const [itemType, setItemType] = useState<string>("educational");
  const [title, setTitle] = useState("Nova ação");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [educationRefId, setEducationRefId] = useState("");

  // NR-1 form states
  const [controlHierarchy, setControlHierarchy] = useState("");
  const [trainingTypeField, setTrainingTypeField] = useState("");
  const [monitoringFrequency, setMonitoringFrequency] = useState("");
  const [effectivenessCriteria, setEffectivenessCriteria] = useState("");
  const [affectedWorkersCount, setAffectedWorkersCount] = useState<number | "">("");

  // Filter states
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterResponsible, setFilterResponsible] = useState("all");
  const [filterSearch, setFilterSearch] = useState("");

  // Stats
  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter(i => i.status === "done").length;
    const overdue = items.filter(i => i.is_overdue).length;
    const inProgress = items.filter(i => i.status === "in_progress").length;
    return { total, done, overdue, inProgress, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      if (filterPriority !== "all" && i.priority !== filterPriority) return false;
      if (filterType !== "all" && i.item_type !== filterType) return false;
      if (filterResponsible !== "all" && (i.responsible_user_id || "") !== filterResponsible) return false;
      if (filterSearch.trim() && !i.title.toLowerCase().includes(filterSearch.toLowerCase())) return false;
      return true;
    });
  }, [items, filterPriority, filterType, filterResponsible, filterSearch]);

  const byStatus = useMemo(() => {
    const map: Record<string, ActionItemOut[]> = { planned: [], in_progress: [], done: [] };
    for (const i of filteredItems) {
      const k = i.status || "planned";
      if (map[k]) map[k].push(i);
    }
    return map;
  }, [filteredItems]);

  async function loadAssessments() {
    try {
      const r = await listAssessments({ limit: 200, cnpj_id: scope.cnpjId || undefined });
      setAssessments(r.items);
      if (!assessmentId && r.items[0]?.id) setAssessmentId(r.items[0].id);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  }

  async function loadPlans(raId: string) {
    if (!raId) return;
    try {
      const r = await listActionPlans({ risk_assessment_id: raId, include_stats: true, limit: 200 });
      setPlans(r.items);
      if (r.items[0]?.id) setPlanId(r.items[0].id); else setPlanId("");
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  }

  async function loadItems(pId: string) {
    if (!pId) { setItems([]); return; }
    try {
      const r = await listActionItems(pId, { include_evidences: true, include_comments: true, limit: 200 });
      setItems(r.items);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  }

  async function loadUsers() {
    try {
      const u = await listAssignableUsers(undefined, 100);
      setUsers(u);
    } catch { setUsers([]); }
  }

  async function loadContents() {
    try {
      const c = await listContents();
      setContents(c.map(x => ({ id: x.id, title: x.title })));
    } catch { setContents([]); }
  }

  async function loadOrgUnits() {
    try {
      const units = await listUnits();
      setOrgUnits(units.map(u => ({ id: u.id, name: u.name })));
    } catch { setOrgUnits([]); }
  }

  async function loadCnpjs() {
    try {
      const cnpjs = await listCnpjs();
      setCnpjsList(cnpjs.map(c => ({ id: c.id, legal_name: c.legal_name || c.cnpj_number, cnpj: c.cnpj_number })));
    } catch { setCnpjsList([]); }
  }

  useEffect(() => { loadAssessments(); loadUsers(); loadContents(); loadOrgUnits(); loadCnpjs(); }, [scope.cnpjId]);
  useEffect(() => { if (assessmentId) loadPlans(assessmentId); }, [assessmentId]);
  useEffect(() => { if (planId) loadItems(planId); }, [planId]);

  async function onCreatePlan() {
    try {
      if (!assessmentId) throw new Error("Selecione uma avaliação");
      const r = await createActionPlan({ risk_assessment_id: assessmentId });
      toast.success("Plano criado");
      await loadPlans(assessmentId);
      setPlanId(r.id);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  }

  async function onAddItem() {
    try {
      if (!planId) throw new Error("Selecione um plano");
      const payload: any = { item_type: itemType, title, description, status: "planned", priority };
      if (responsibleUserId && responsibleUserId !== "__none__") payload.responsible_user_id = responsibleUserId;
      else if (responsible) payload.responsible = responsible;
      if (dueDate) payload.due_date = new Date(dueDate).toISOString();
      if (itemType === "educational" && educationRefId) {
        payload.education_ref_type = "content_item";
        payload.education_ref_id = educationRefId;
      }
      if (controlHierarchy) payload.control_hierarchy = controlHierarchy;
      if (itemType === "educational" && trainingTypeField) payload.training_type = trainingTypeField;
      if (monitoringFrequency) payload.monitoring_frequency = monitoringFrequency;
      if (effectivenessCriteria.trim()) payload.effectiveness_criteria = effectivenessCriteria;
      if (affectedWorkersCount !== "" && affectedWorkersCount > 0) payload.affected_workers_count = affectedWorkersCount;
      await addActionItem(planId, payload);
      toast.success("Item adicionado");
      await loadItems(planId);
      setTitle("Nova ação"); setDescription(""); setResponsible(""); setResponsibleUserId(""); setDueDate("");
      setControlHierarchy(""); setTrainingTypeField(""); setMonitoringFrequency(""); setEffectivenessCriteria(""); setAffectedWorkersCount("");
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  }

  async function onMoveItem(item: ActionItemOut, newStatus: string) {
    try {
      await updateActionItem(item.id, { status: newStatus });
      toast.success("Status atualizado");
      await loadItems(planId);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  }

  async function onDeleteItem(itemId: string) {
    if (!window.confirm("Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.")) return;
    try {
      await apiDeleteActionItem(itemId);
      toast.success("Item excluído");
      await loadItems(planId);
    } catch (e: any) { toast.error(e?.message || "Erro ao excluir"); }
  }

  function openItemDrawer(item: ActionItemOut) {
    setSelectedItem(item);
    setDrawerOpen(true);
  }

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Plano de Ação"
        description="Gerencie ações corretivas e preventivas com responsáveis, prazos e evidências."
      />

      {/* Stats Cards */}
      {planId && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">Total de itens</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
              <p className="text-xs text-muted-foreground">Em execução</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.done}</div>
              <p className="text-xs text-muted-foreground">Concluídos</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
              <p className="text-xs text-muted-foreground">Atrasados</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{stats.pct}%</div>
              <Progress value={stats.pct} className="mt-2" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Selectors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Selecionar Avaliação e Plano</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Avaliação de Risco</Label>
            <Select value={assessmentId} onValueChange={setAssessmentId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {assessments.map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.campaign_name || 'Campanha'} {a.org_unit_name ? `• ${a.org_unit_name}` : ''} • {new Date(a.assessed_at).toLocaleDateString()} • {a.level.toUpperCase()} ({(a.score * 100).toFixed(0)}%)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Plano de Ação</Label>
            <div className="flex gap-2">
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      Plano v{p.version} • {p.status} • {new Date(p.created_at).toLocaleDateString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={onCreatePlan} disabled={!assessmentId}>
                <Plus className="h-4 w-4 mr-1" /> Criar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter Bar */}
      {planId && (
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros</span>
            </div>
            <div className="flex flex-wrap gap-4">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por título..."
                  value={filterSearch}
                  onChange={e => setFilterSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {/* Priority filter */}
              <div className="flex gap-1 items-center flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Prioridade:</span>
                {[{ key: "all", label: "Todas" }, { key: "low", label: "Baixa" }, { key: "medium", label: "Média" }, { key: "high", label: "Alta" }, { key: "critical", label: "Crítica" }].map(p => (
                  <Button key={p.key} size="sm" variant={filterPriority === p.key ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFilterPriority(p.key)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {/* Type filter */}
              <div className="flex gap-1 items-center flex-wrap">
                <span className="text-xs text-muted-foreground mr-1">Tipo:</span>
                {[{ key: "all", label: "Todos" }, { key: "educational", label: "Educativa" }, { key: "organizational", label: "Organizacional" }, { key: "administrative", label: "Administrativa" }, { key: "support", label: "Apoio" }].map(t => (
                  <Button key={t.key} size="sm" variant={filterType === t.key ? "default" : "outline"} className="h-7 text-xs" onClick={() => setFilterType(t.key)}>
                    {t.label}
                  </Button>
                ))}
              </div>
              {/* Responsible filter */}
              <div className="flex gap-1 items-center">
                <span className="text-xs text-muted-foreground mr-1">Responsável:</span>
                <Select value={filterResponsible} onValueChange={setFilterResponsible}>
                  <SelectTrigger className="h-7 w-[180px] text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(filterPriority !== "all" || filterType !== "all" || filterResponsible !== "all" || filterSearch.trim()) && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{filteredItems.length} de {items.length} itens</Badge>
                <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => { setFilterPriority("all"); setFilterType("all"); setFilterResponsible("all"); setFilterSearch(""); }}>
                  Limpar filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Kanban */}
      {planId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kanban</CardTitle>
            <CardDescription>Clique no item para detalhes ou use os botões para mover entre colunas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {COLUMNS.map(col => (
                <div key={col.key} className="rounded-lg border bg-muted/20 p-3 min-h-[300px]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      {col.icon} {col.label}
                    </div>
                    <Badge variant="outline">{byStatus[col.key]?.length || 0}</Badge>
                  </div>
                  <div className="space-y-2">
                    {(byStatus[col.key] || []).map(item => (
                      <div
                        key={item.id}
                        className={`p-3 rounded-lg border bg-card cursor-pointer hover:shadow-md transition ${item.is_overdue ? "border-red-300 bg-red-50/50" : ""}`}
                        onClick={() => openItemDrawer(item)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-sm truncate flex-1">{item.title}</h4>
                          <PriorityBadge priority={item.priority} />
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          {TYPE_CONFIG[item.item_type]?.icon}
                          <span>{TYPE_CONFIG[item.item_type]?.label}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {item.control_hierarchy && CONTROL_HIERARCHY_CONFIG[item.control_hierarchy] && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CONTROL_HIERARCHY_CONFIG[item.control_hierarchy].color}`}>
                              <Shield className="h-2.5 w-2.5 mr-0.5" />{CONTROL_HIERARCHY_CONFIG[item.control_hierarchy].label}
                            </Badge>
                          )}
                          {item.item_type === "educational" && item.training_type && TRAINING_TYPE_CONFIG[item.training_type] && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-50 text-purple-700">
                              <GraduationCap className="h-2.5 w-2.5 mr-0.5" />{TRAINING_TYPE_CONFIG[item.training_type].label}
                            </Badge>
                          )}
                          {item.affected_workers_count != null && item.affected_workers_count > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-700">
                              <UsersRound className="h-2.5 w-2.5 mr-0.5" />{item.affected_workers_count}
                            </Badge>
                          )}
                        </div>
                        {item.responsible_user?.full_name || item.responsible ? (
                          <div className="flex items-center gap-1 mt-2 text-xs">
                            <User className="h-3 w-3" />
                            <span className="truncate">{item.responsible_user?.full_name || item.responsible}</span>
                          </div>
                        ) : null}
                        {item.due_date && (
                          <div className={`flex items-center gap-1 mt-1 text-xs ${item.is_overdue ? "text-red-600" : "text-muted-foreground"}`}>
                            {item.is_overdue ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                            <span>{new Date(item.due_date).toLocaleDateString()}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {item.evidence_count > 0 && <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{item.evidence_count}</span>}
                          {item.comment_count > 0 && <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{item.comment_count}</span>}
                        </div>
                        <div className="flex gap-1 mt-2">
                          {COLUMNS.filter(c => c.key !== item.status).map(c => (
                            <Button key={c.key} size="sm" variant="ghost" className="h-6 text-xs flex-1" onClick={e => { e.stopPropagation(); onMoveItem(item, c.key); }}>
                              {c.label}
                            </Button>
                          ))}
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={e => { e.stopPropagation(); onDeleteItem(item.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {(byStatus[col.key] || []).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-8">Sem itens</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Item Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar Item</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={itemType} onValueChange={setItemType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="educational">Educativa (LMS)</SelectItem>
                  <SelectItem value="organizational">Organizacional</SelectItem>
                  <SelectItem value="administrative">Administrativa</SelectItem>
                  <SelectItem value="support">Apoio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Título</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Responsável</Label>
              <Select value={responsibleUserId || undefined} onValueChange={v => { setResponsibleUserId(v === "__none__" ? "" : v); setResponsible(""); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar usuário..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Prazo</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* NR-1 Fields */}
            <div className="grid gap-2">
              <Label>Hierarquia de Controles</Label>
              <Select value={controlHierarchy || undefined} onValueChange={v => setControlHierarchy(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  <SelectItem value="elimination">Eliminação</SelectItem>
                  <SelectItem value="substitution">Substituição/Redução</SelectItem>
                  <SelectItem value="epc">EPC (Proteção Coletiva)</SelectItem>
                  <SelectItem value="administrative">Administrativo</SelectItem>
                  <SelectItem value="epi">EPI (Proteção Individual)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {itemType === "educational" && (
              <div className="grid gap-2">
                <Label>Tipo de Treinamento</Label>
                <Select value={trainingTypeField || undefined} onValueChange={v => setTrainingTypeField(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    <SelectItem value="initial">Inicial</SelectItem>
                    <SelectItem value="periodic">Periódico</SelectItem>
                    <SelectItem value="eventual">Eventual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Frequência de Monitoramento</Label>
                <Select value={monitoringFrequency || undefined} onValueChange={v => setMonitoringFrequency(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                    <SelectItem value="semiannual">Semestral</SelectItem>
                    <SelectItem value="annual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Nº Trabalhadores Atingidos</Label>
                <Input type="number" min={0} placeholder="0" value={affectedWorkersCount} onChange={e => setAffectedWorkersCount(e.target.value ? parseInt(e.target.value) : "")} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Critério de Eficácia</Label>
              <Textarea value={effectivenessCriteria} onChange={e => setEffectivenessCriteria(e.target.value)} rows={2} placeholder="Descreva como a eficácia será avaliada..." />
            </div>
            {itemType === "educational" && contents.length > 0 && (
              <div className="grid gap-2">
                <Label>Conteúdo LMS</Label>
                <Select value={educationRefId || undefined} onValueChange={v => setEducationRefId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Vincular conteúdo..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {contents.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button onClick={onAddItem} disabled={!planId || !title.trim()} className="w-full">
              <Plus className="h-4 w-4 mr-1" /> Adicionar Item
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Item Detail Drawer */}
      <ItemDetailDrawer
        item={selectedItem}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setSelectedItem(null); }}
        onUpdate={() => loadItems(planId)}
        users={users}
        tenantSlug={tenantSlug}
        orgUnits={orgUnits}
        cnpjs={cnpjsList.map(c => ({ id: c.id, legal_name: c.legal_name || c.cnpj }))}
      />
    </div>
  );
}

function ItemDetailDrawer({ item, open, onClose, onUpdate, users, orgUnits, cnpjs, tenantSlug }: {
  item: ActionItemOut | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
  users: ResponsibleUserInfo[];
  tenantSlug?: string;
  orgUnits: Array<{ id: string; name: string }>;
  cnpjs: Array<{ id: string; legal_name: string }>;
}) {
  const [tab, setTab] = useState("details");
  const [fullItem, setFullItem] = useState<ActionItemOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("planned");
  const [editControlHierarchy, setEditControlHierarchy] = useState("");
  const [editTrainingType, setEditTrainingType] = useState("");
  const [editMonitoringFrequency, setEditMonitoringFrequency] = useState("");
  const [editEffectivenessCriteria, setEditEffectivenessCriteria] = useState("");
  const [editAffectedWorkersCount, setEditAffectedWorkersCount] = useState<number | "">("");
  const [evType, setEvType] = useState("note");
  const [evRef, setEvRef] = useState("");
  const [evNote, setEvNote] = useState("");
  const [comment, setComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentContent, setEditingCommentContent] = useState("");

  useEffect(() => {
    if (item && open) {
      setLoading(true);
      getActionItem(item.id, { include_evidences: true, include_comments: true, include_history: true })
        .then(d => {
          setFullItem(d);
          setTitle(d.title);
          setDescription(d.description || "");
          setResponsibleUserId(d.responsible_user_id || "");
          setDueDate(d.due_date ? d.due_date.split("T")[0] : "");
          setPriority(d.priority);
          setStatus(d.status);
          setEditControlHierarchy(d.control_hierarchy || "");
          setEditTrainingType(d.training_type || "");
          setEditMonitoringFrequency(d.monitoring_frequency || "");
          setEditEffectivenessCriteria(d.effectiveness_criteria || "");
          setEditAffectedWorkersCount(d.affected_workers_count ?? "");
        })
        .finally(() => setLoading(false));
    }
  }, [item?.id, open]);

  async function handleSave() {
    if (!fullItem) return;
    setLoading(true);
    try {
      await updateActionItem(fullItem.id, {
        title, description, responsible_user_id: responsibleUserId || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null, priority, status,
        control_hierarchy: editControlHierarchy || null,
        training_type: editTrainingType || null,
        monitoring_frequency: editMonitoringFrequency || null,
        effectiveness_criteria: editEffectivenessCriteria || null,
        affected_workers_count: editAffectedWorkersCount !== "" ? editAffectedWorkersCount : null,
      });
      toast.success("Atualizado");
      setEditMode(false);
      onUpdate();
      const d = await getActionItem(fullItem.id, { include_evidences: true, include_comments: true, include_history: true });
      setFullItem(d);
    } catch (e: any) { toast.error(e?.message); }
    setLoading(false);
  }

  async function handleAddEvidence() {
    if (!fullItem || !evRef.trim()) return;
    try {
      await addEvidence(fullItem.id, { evidence_type: evType, reference: evRef, note: evNote || undefined });
      toast.success("Evidência adicionada");
      setEvRef(""); setEvNote("");
      const d = await getActionItem(fullItem.id, { include_evidences: true, include_comments: true, include_history: true });
      setFullItem(d);
      onUpdate();
    } catch (e: any) { toast.error(e?.message); }
  }

  async function handleAddComment() {
    if (!fullItem || !comment.trim()) return;
    try {
      await addComment(fullItem.id, { content: comment });
      toast.success("Comentário adicionado");
      setComment("");
      const d = await getActionItem(fullItem.id, { include_evidences: true, include_comments: true, include_history: true });
      setFullItem(d);
      onUpdate();
    } catch (e: any) { toast.error(e?.message); }
  }

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{fullItem?.title || item.title}</DialogTitle>
          <div className="flex gap-2 mt-2">
            <StatusBadge status={fullItem?.status || item.status} />
            <PriorityBadge priority={fullItem?.priority || item.priority} />
          </div>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="evidences">Evidências ({fullItem?.evidences?.length || 0})</TabsTrigger>
            <TabsTrigger value="comments">Comentários ({fullItem?.comments?.length || 0})</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="enrollments">Matrículas</TabsTrigger>
          </TabsList>
          <div className="flex-1 overflow-y-auto mt-4 pr-2">
            <TabsContent value="details" className="m-0">
              {editMode ? (
                <div className="space-y-3">
                  <div className="grid gap-2"><Label>Título</Label><Input value={title} onChange={e => setTitle(e.target.value)} /></div>
                  <div className="grid gap-2"><Label>Descrição</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Responsável</Label>
                      <Select value={responsibleUserId || undefined} onValueChange={v => setResponsibleUserId(v === "__none__" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2"><Label>Prazo</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Prioridade</Label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Baixa</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="critical">Crítica</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Status</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planejado</SelectItem>
                          <SelectItem value="in_progress">Em Execução</SelectItem>
                          <SelectItem value="done">Concluído</SelectItem>
                          <SelectItem value="blocked">Bloqueado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {/* NR-1 Fields */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Hierarquia de Controles</Label>
                      <Select value={editControlHierarchy || undefined} onValueChange={v => setEditControlHierarchy(v === "__none__" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          <SelectItem value="elimination">Eliminação</SelectItem>
                          <SelectItem value="substitution">Substituição/Redução</SelectItem>
                          <SelectItem value="epc">EPC (Proteção Coletiva)</SelectItem>
                          <SelectItem value="administrative">Administrativo</SelectItem>
                          <SelectItem value="epi">EPI (Proteção Individual)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Frequência de Monitoramento</Label>
                      <Select value={editMonitoringFrequency || undefined} onValueChange={v => setEditMonitoringFrequency(v === "__none__" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="quarterly">Trimestral</SelectItem>
                          <SelectItem value="semiannual">Semestral</SelectItem>
                          <SelectItem value="annual">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {fullItem?.item_type === "educational" && (
                    <div className="grid gap-2">
                      <Label>Tipo de Treinamento</Label>
                      <Select value={editTrainingType || undefined} onValueChange={v => setEditTrainingType(v === "__none__" ? "" : v)}>
                        <SelectTrigger><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Nenhum</SelectItem>
                          <SelectItem value="initial">Inicial</SelectItem>
                          <SelectItem value="periodic">Periódico</SelectItem>
                          <SelectItem value="eventual">Eventual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Nº Trabalhadores Atingidos</Label>
                      <Input type="number" min={0} placeholder="0" value={editAffectedWorkersCount} onChange={e => setEditAffectedWorkersCount(e.target.value ? parseInt(e.target.value) : "")} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label>Critério de Eficácia</Label>
                    <Textarea value={editEffectivenessCriteria} onChange={e => setEditEffectivenessCriteria(e.target.value)} rows={2} placeholder="Descreva como a eficácia será avaliada..." />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button onClick={handleSave} disabled={loading}>Salvar</Button>
                    <Button variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div><Label className="text-muted-foreground text-xs">Descrição</Label><p className="text-sm mt-1">{fullItem?.description || "—"}</p></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label className="text-muted-foreground text-xs">Responsável</Label><p className="text-sm mt-1 flex items-center gap-1"><User className="h-3 w-3" />{fullItem?.responsible_user?.full_name || fullItem?.responsible || "Não atribuído"}</p></div>
                    <div><Label className="text-muted-foreground text-xs">Prazo</Label><p className="text-sm mt-1">{fullItem?.due_date ? new Date(fullItem.due_date).toLocaleDateString() : "—"}</p></div>
                  </div>
                  {/* NR-1 Info */}
                  <div className="grid grid-cols-2 gap-4">
                    {fullItem?.control_hierarchy && CONTROL_HIERARCHY_CONFIG[fullItem.control_hierarchy] && (
                      <div><Label className="text-muted-foreground text-xs">Hierarquia de Controles</Label><p className="text-sm mt-1"><Badge variant="outline" className={CONTROL_HIERARCHY_CONFIG[fullItem.control_hierarchy].color}><Shield className="h-3 w-3 mr-1" />{CONTROL_HIERARCHY_CONFIG[fullItem.control_hierarchy].label}</Badge></p></div>
                    )}
                    {fullItem?.item_type === "educational" && fullItem.training_type && TRAINING_TYPE_CONFIG[fullItem.training_type] && (
                      <div><Label className="text-muted-foreground text-xs">Tipo de Treinamento</Label><p className="text-sm mt-1">{TRAINING_TYPE_CONFIG[fullItem.training_type].label}</p></div>
                    )}
                    {fullItem?.monitoring_frequency && MONITORING_FREQUENCY_CONFIG[fullItem.monitoring_frequency] && (
                      <div><Label className="text-muted-foreground text-xs">Frequência de Monitoramento</Label><p className="text-sm mt-1">{MONITORING_FREQUENCY_CONFIG[fullItem.monitoring_frequency].label}</p></div>
                    )}
                    {fullItem?.affected_workers_count != null && fullItem.affected_workers_count > 0 && (
                      <div><Label className="text-muted-foreground text-xs">Nº Trabalhadores Atingidos</Label><p className="text-sm mt-1 flex items-center gap-1"><UsersRound className="h-3 w-3" />{fullItem.affected_workers_count}</p></div>
                    )}
                  </div>
                  {fullItem?.effectiveness_criteria && (
                    <div><Label className="text-muted-foreground text-xs">Critério de Eficácia</Label><p className="text-sm mt-1 whitespace-pre-wrap">{fullItem.effectiveness_criteria}</p></div>
                  )}
                  {fullItem?.started_at && <div><Label className="text-muted-foreground text-xs">Iniciado em</Label><p className="text-sm mt-1">{new Date(fullItem.started_at).toLocaleString()}</p></div>}
                  {fullItem?.completed_at && <div><Label className="text-muted-foreground text-xs">Concluído em</Label><p className="text-sm mt-1">{new Date(fullItem.completed_at).toLocaleString()}</p></div>}
                  <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>Editar</Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="evidences" className="m-0 space-y-4">
              <div className="text-xs text-muted-foreground mb-2">
                Registre evidências: faça upload de arquivos, adicione links ou notas.
              </div>
              
              {/* Upload de arquivo */}
              <div className="p-3 border-2 border-dashed rounded-lg hover:border-primary/50 transition">
                <input
                  type="file"
                  id="evidence-file-upload"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file || !fullItem) return;
                    setLoading(true);
                    try {
                      await uploadEvidenceFile(fullItem.id, file, evNote || undefined);
                      toast.success("Arquivo enviado!");
                      setEvNote("");
                      const d = await getActionItem(fullItem.id, { include_evidences: true, include_comments: true, include_history: true });
                      setFullItem(d);
                      onUpdate();
                    } catch (err: any) {
                      toast.error(err?.message || "Erro no upload");
                    } finally {
                      setLoading(false);
                      e.target.value = "";
                    }
                  }}
                />
                <label htmlFor="evidence-file-upload" className="flex flex-col items-center cursor-pointer py-2">
                  <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                  <span className="text-sm font-medium">Clique para fazer upload</span>
                  <span className="text-xs text-muted-foreground">PDF, imagens, documentos (máx 10MB)</span>
                </label>
              </div>
              
              {/* Nota/Link manual */}
              <div className="flex gap-2">
                <Select value={evType} onValueChange={setEvType}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="note">📝 Nota</SelectItem><SelectItem value="link">🔗 Link</SelectItem></SelectContent></Select>
                <Input 
                  placeholder={evType === "link" ? "https://..." : "Descrição da evidência..."} 
                  value={evRef} 
                  onChange={e => setEvRef(e.target.value)} 
                  className="flex-1" 
                />
                <Button size="sm" onClick={handleAddEvidence} disabled={!evRef.trim()}><Plus className="h-4 w-4" /></Button>
              </div>
              <Input placeholder="Observação adicional (opcional)" value={evNote} onChange={e => setEvNote(e.target.value)} />
              
              {/* Lista de evidências */}
              <div className="space-y-2">
                {(fullItem?.evidences || []).map(ev => (
                  <div key={ev.id} className="p-2 rounded border bg-muted/30 text-sm">
                    <div className="flex items-center gap-2">
                      {ev.evidence_type === "file" ? <FileText className="h-4 w-4 text-blue-500" /> : ev.evidence_type === "link" ? <LinkIcon className="h-4 w-4 text-green-500" /> : <MessageSquare className="h-4 w-4 text-gray-500" />}
                      <span className="flex-1 truncate">{ev.file_name || ev.reference}</span>
                      {ev.file_size && <span className="text-xs text-muted-foreground">{(ev.file_size / 1024).toFixed(0)} KB</span>}
                      {ev.storage_key && (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={async () => {
                          try {
                            const { download_url } = await getEvidenceDownloadUrl(fullItem!.id, ev.id);
                            window.open(download_url, "_blank");
                          } catch (err: any) {
                            toast.error(err?.message || "Erro ao baixar");
                          }
                        }}>
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={async () => {
                        if (!window.confirm("Excluir esta evidência?")) return;
                        try {
                          await apiDeleteEvidence(fullItem!.id, ev.id);
                          toast.success("Evidência excluída");
                          const d = await getActionItem(fullItem!.id, { include_evidences: true, include_comments: true, include_history: true });
                          setFullItem(d);
                          onUpdate();
                        } catch (err: any) { toast.error(err?.message || "Erro ao excluir"); }
                      }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {ev.note && <p className="text-xs text-muted-foreground mt-1">{ev.note}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{ev.created_by_user?.full_name || "Sistema"} • {new Date(ev.created_at).toLocaleString()}</p>
                  </div>
                ))}
                {(fullItem?.evidences || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma evidência</p>}
              </div>
            </TabsContent>
            <TabsContent value="comments" className="m-0 space-y-4">
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {(fullItem?.comments || []).map(c => (
                  <div key={c.id} className="p-2 rounded border bg-muted/30 text-sm">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />{c.user?.full_name || c.user?.email || "?"} • {new Date(c.created_at).toLocaleString()}
                      {c.edited_at && <span className="italic">(editado)</span>}
                      <div className="ml-auto flex gap-0.5">
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setEditingCommentId(c.id); setEditingCommentContent(c.content); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={async () => {
                          if (!window.confirm("Excluir este comentário?")) return;
                          try {
                            await apiDeleteComment(fullItem!.id, c.id);
                            toast.success("Comentário excluído");
                            const d = await getActionItem(fullItem!.id, { include_evidences: true, include_comments: true, include_history: true });
                            setFullItem(d);
                            onUpdate();
                          } catch (err: any) { toast.error(err?.message || "Erro ao excluir"); }
                        }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    {editingCommentId === c.id ? (
                      <div className="mt-1 flex gap-1">
                        <Textarea value={editingCommentContent} onChange={e => setEditingCommentContent(e.target.value)} rows={2} className="flex-1 text-sm" />
                        <div className="flex flex-col gap-1">
                          <Button size="sm" className="h-7 text-xs" onClick={async () => {
                            try {
                              await apiUpdateComment(fullItem!.id, c.id, { content: editingCommentContent });
                              toast.success("Comentário atualizado");
                              setEditingCommentId(null);
                              const d = await getActionItem(fullItem!.id, { include_evidences: true, include_comments: true, include_history: true });
                              setFullItem(d);
                              onUpdate();
                            } catch (err: any) { toast.error(err?.message || "Erro"); }
                          }} disabled={!editingCommentContent.trim()}>Salvar</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingCommentId(null)}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1">{c.content}</p>
                    )}
                  </div>
                ))}
                {(fullItem?.comments || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhum comentário</p>}
              </div>
              <div className="flex gap-2">
                <Textarea placeholder="Adicionar comentário..." value={comment} onChange={e => setComment(e.target.value)} rows={2} className="flex-1" />
                <Button size="sm" onClick={handleAddComment} disabled={!comment.trim()}><Send className="h-4 w-4" /></Button>
              </div>
            </TabsContent>
            <TabsContent value="history" className="m-0">
              <div className="space-y-2">
                {(fullItem?.history || []).map(h => (
                  <div key={h.id} className="p-2 rounded border bg-muted/30 text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{h.field_changed}</Badge>
                      <span className="text-xs text-muted-foreground">{h.old_value || "—"} → {h.new_value || "—"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{h.user?.full_name || "Sistema"} • {new Date(h.changed_at).toLocaleString()}</p>
                  </div>
                ))}
                {(fullItem?.history || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Sem histórico</p>}
              </div>
            </TabsContent>
            <TabsContent value="enrollments" className="m-0">
              {fullItem && (
                <EnrollmentsTab
                  itemId={fullItem.id}
                  itemType={fullItem.item_type}
                  tenantSlug={tenantSlug}
                  onUpdate={() => {
                    onUpdate();
                    getActionItem(fullItem.id, { include_evidences: true, include_comments: true, include_history: true })
                      .then(setFullItem);
                  }}
                  orgUnits={orgUnits}
                  cnpjs={cnpjs}
                />
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
