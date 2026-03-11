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
  type ActionPlanOut, type ActionItemOut, type ResponsibleUserInfo,
} from "@/lib/api/actionPlans";
import { listContents } from "@/lib/api/lms";
import { useConsole } from "@/components/console/console-provider";
import { AlertTriangle, Calendar, CheckCircle2, Clock, MessageSquare, Paperclip, Plus, TrendingUp, User, GraduationCap, Building2, ClipboardList, Users, Trash2, Send, Upload, Download, FileText, Link as LinkIcon } from "lucide-react";

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

  // Stats
  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter(i => i.status === "done").length;
    const overdue = items.filter(i => i.is_overdue).length;
    const inProgress = items.filter(i => i.status === "in_progress").length;
    return { total, done, overdue, inProgress, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [items]);

  const byStatus = useMemo(() => {
    const map: Record<string, ActionItemOut[]> = { planned: [], in_progress: [], done: [] };
    for (const i of items) {
      const k = i.status || "planned";
      if (map[k]) map[k].push(i);
    }
    return map;
  }, [items]);

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
      await addActionItem(planId, payload);
      toast.success("Item adicionado");
      await loadItems(planId);
      setTitle("Nova ação"); setDescription(""); setResponsible(""); setResponsibleUserId(""); setDueDate("");
    } catch (e: any) { toast.error(e?.message || "Erro"); }
  }

  async function onMoveItem(item: ActionItemOut, newStatus: string) {
    try {
      await updateActionItem(item.id, { status: newStatus });
      toast.success("Status atualizado");
      await loadItems(planId);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
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
  const [evType, setEvType] = useState("note");
  const [evRef, setEvRef] = useState("");
  const [evNote, setEvNote] = useState("");
  const [comment, setComment] = useState("");

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
        })
        .finally(() => setLoading(false));
    }
  }, [item?.id, open]);

  async function handleSave() {
    if (!fullItem) return;
    setLoading(true);
    try {
      await updateActionItem(fullItem.id, { title, description, responsible_user_id: responsibleUserId || null, due_date: dueDate ? new Date(dueDate).toISOString() : null, priority, status });
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
                    <div className="flex items-center gap-2 text-xs text-muted-foreground"><User className="h-3 w-3" />{c.user?.full_name || c.user?.email || "?"} • {new Date(c.created_at).toLocaleString()}</div>
                    <p className="mt-1">{c.content}</p>
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
