"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useConsole } from "@/components/console/console-provider";

import {
  listContents,
  createContent,
  updateContent,
  deleteContent,
  createContentUpload,
  getContentAccess,
  listLearningPaths,
  createLearningPath,
  updateLearningPath,
  deleteLearningPath,
  listAssignments,
  createAssignment,
  updateAssignment,
  deleteAssignment,
  bulkCreateAssignments,
  createCompletion,
  getLMSStats,
} from "@/lib/api/lms";
import type { LearningPathOut, LMSStatsOut } from "@/lib/api/lms";
import type { ContentOut, LMSAssignmentOut, EmployeeOut, OrgUnitOut } from "@/lib/api/types";
import { listEmployees } from "@/lib/api/employees";
import { listUnits } from "@/lib/api/org";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = { video: "Video", pdf: "PDF", link: "Link" };
const STATUS_COLORS: Record<string, string> = {
  assigned: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

function shortId(id: string) {
  return id.slice(0, 8);
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LMSPage() {
  const { me } = useConsole();
  const isPlatformAdmin = !!me?.is_platform_admin;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);

  // Data
  const [contents, setContents] = useState<ContentOut[]>([]);
  const [paths, setPaths] = useState<LearningPathOut[]>([]);
  const [assignments, setAssignments] = useState<LMSAssignmentOut[]>([]);
  const [assignmentTotal, setAssignmentTotal] = useState(0);
  const [stats, setStats] = useState<LMSStatsOut | null>(null);
  const [employees, setEmployees] = useState<EmployeeOut[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitOut[]>([]);

  // Filters
  const [contentSearch, setContentSearch] = useState("");
  const [contentTypeFilter, setContentTypeFilter] = useState("all");
  const [assignStatusFilter, setAssignStatusFilter] = useState("all");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cs, ps, asg, st, emps, units] = await Promise.allSettled([
        listContents(),
        listLearningPaths(),
        listAssignments({ limit: 100 }),
        getLMSStats(),
        listEmployees(),
        listUnits(),
      ]);
      if (cs.status === "fulfilled") setContents(cs.value);
      if (ps.status === "fulfilled") setPaths(ps.value);
      if (asg.status === "fulfilled") {
        setAssignments(asg.value.items || []);
        setAssignmentTotal(asg.value.total ?? 0);
      }
      if (st.status === "fulfilled") setStats(st.value);
      if (emps.status === "fulfilled") setEmployees(emps.value);
      if (units.status === "fulfilled") setOrgUnits(units.value);
    } catch (e: any) {
      toast({ title: "Erro ao carregar dados", description: e?.message || "" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Filtered Data ──────────────────────────────────────────────────────────

  const filteredContents = useMemo(() => {
    let list = contents;
    if (contentSearch) {
      const s = contentSearch.toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(s) || c.description?.toLowerCase().includes(s));
    }
    if (contentTypeFilter !== "all") list = list.filter((c) => c.content_type === contentTypeFilter);
    return list;
  }, [contents, contentSearch, contentTypeFilter]);

  const filteredAssignments = useMemo(() => {
    if (assignStatusFilter === "all") return assignments;
    return assignments.filter((a) => a.status === assignStatusFilter);
  }, [assignments, assignStatusFilter]);

  const employeeMap = useMemo(() => {
    const m: Record<string, string> = {};
    employees.forEach((e) => { m[e.id] = e.full_name; });
    return m;
  }, [employees]);

  const unitMap = useMemo(() => {
    const m: Record<string, string> = {};
    orgUnits.forEach((u) => { m[u.id] = u.name; });
    return m;
  }, [orgUnits]);

  const contentMap = useMemo(() => {
    const m: Record<string, string> = {};
    contents.forEach((c) => { m[c.id] = c.title; });
    return m;
  }, [contents]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aprendizagem (LMS)</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gerencie conteudos, trilhas de aprendizagem e atribuicoes para conformidade NR-1
          </p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="dashboard">Painel</TabsTrigger>
          <TabsTrigger value="contents">Biblioteca</TabsTrigger>
          <TabsTrigger value="paths">Trilhas</TabsTrigger>
          <TabsTrigger value="assignments">Atribuicoes</TabsTrigger>
        </TabsList>

        {/* ═══════ TAB: Dashboard ═══════ */}
        <TabsContent value="dashboard" className="space-y-6 mt-6">
          <DashboardTab stats={stats} contents={contents} assignments={assignments} />
        </TabsContent>

        {/* ═══════ TAB: Biblioteca ═══════ */}
        <TabsContent value="contents" className="space-y-6 mt-6">
          <ContentTab
            contents={filteredContents}
            contentSearch={contentSearch}
            setContentSearch={setContentSearch}
            contentTypeFilter={contentTypeFilter}
            setContentTypeFilter={setContentTypeFilter}
            isPlatformAdmin={isPlatformAdmin}
            toast={toast}
            onRefresh={loadAll}
          />
        </TabsContent>

        {/* ═══════ TAB: Trilhas ═══════ */}
        <TabsContent value="paths" className="space-y-6 mt-6">
          <LearningPathTab
            paths={paths}
            contents={contents}
            toast={toast}
            onRefresh={loadAll}
          />
        </TabsContent>

        {/* ═══════ TAB: Atribuicoes ═══════ */}
        <TabsContent value="assignments" className="space-y-6 mt-6">
          <AssignmentTab
            assignments={filteredAssignments}
            assignmentTotal={assignmentTotal}
            assignStatusFilter={assignStatusFilter}
            setAssignStatusFilter={setAssignStatusFilter}
            contents={contents}
            paths={paths}
            employees={employees}
            orgUnits={orgUnits}
            employeeMap={employeeMap}
            unitMap={unitMap}
            contentMap={contentMap}
            toast={toast}
            onRefresh={loadAll}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dashboard Tab
// ═══════════════════════════════════════════════════════════════════════════════

function DashboardTab({
  stats,
  contents,
  assignments,
}: {
  stats: LMSStatsOut | null;
  contents: ContentOut[];
  assignments: LMSAssignmentOut[];
}) {
  if (!stats) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Carregando estatisticas...
        </CardContent>
      </Card>
    );
  }

  const kpis = [
    { label: "Conteudos", value: stats.total_contents, color: "text-blue-600" },
    { label: "Atribuicoes", value: stats.total_assignments, color: "text-indigo-600" },
    { label: "Concluidas", value: stats.total_completed, color: "text-green-600" },
    { label: "Em Andamento", value: stats.total_in_progress, color: "text-yellow-600" },
  ];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{k.label}</p>
              <p className={`text-3xl font-bold mt-1 ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Completion Rate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Taxa de Conclusao</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={stats.completion_rate} className="flex-1 h-3" />
            <span className="text-lg font-semibold text-green-700">{stats.completion_rate.toFixed(1)}%</span>
          </div>
        </CardContent>
      </Card>

      {/* Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Conteudos por Tipo</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.contents_by_type).map(([type, count]) => (
                <div key={type} className="flex justify-between items-center">
                  <span className="text-sm capitalize">{TYPE_LABELS[type] || type}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {Object.keys(stats.contents_by_type).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum conteudo cadastrado</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Atribuicoes por Status</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats.assignments_by_status).map(([status, count]) => (
                <div key={status} className="flex justify-between items-center">
                  <Badge className={STATUS_COLORS[status] || ""}>{status}</Badge>
                  <span className="text-sm font-medium">{count}</span>
                </div>
              ))}
              {Object.keys(stats.assignments_by_status).length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma atribuicao</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Content Tab
// ═══════════════════════════════════════════════════════════════════════════════

function ContentTab({
  contents,
  contentSearch,
  setContentSearch,
  contentTypeFilter,
  setContentTypeFilter,
  isPlatformAdmin,
  toast,
  onRefresh,
}: {
  contents: ContentOut[];
  contentSearch: string;
  setContentSearch: (v: string) => void;
  contentTypeFilter: string;
  setContentTypeFilter: (v: string) => void;
  isPlatformAdmin: boolean;
  toast: any;
  onRefresh: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"link" | "upload">("link");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [isOfficial, setIsOfficial] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  function resetForm() {
    setTitle(""); setDescription(""); setUrl(""); setDurationMin(""); setIsOfficial(false); setFile(null);
    setShowForm(false);
  }

  async function onSave() {
    if (!title.trim()) { toast({ title: "Titulo obrigatorio" }); return; }
    setSaving(true);
    try {
      if (formMode === "link") {
        if (!url.trim()) { toast({ title: "URL obrigatoria para link" }); setSaving(false); return; }
        await createContent({
          title: title.trim(),
          description: description.trim() || undefined,
          content_type: "link",
          url: url.trim(),
          duration_minutes: durationMin ? parseInt(durationMin) : undefined,
          is_platform_managed: isPlatformAdmin ? isOfficial : false,
        });
        toast({ title: "Conteudo criado com sucesso" });
      } else {
        if (!file) { toast({ title: "Selecione um arquivo" }); setSaving(false); return; }
        setUploadStatus("Registrando conteudo...");
        const up = await createContentUpload({
          title: title.trim(),
          description: description.trim() || undefined,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          duration_seconds: durationMin ? parseInt(durationMin) * 60 : undefined,
          is_platform_managed: isPlatformAdmin ? isOfficial : false,
        });
        setUploadStatus(`Enviando ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);
        let putRes: Response;
        try {
          putRes = await fetch(up.upload_url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
        } catch (netErr: any) {
          console.error("Upload network error:", netErr);
          throw new Error(
            `Falha de rede ao enviar arquivo para o storage. Verifique se o MinIO esta acessivel em ${new URL(up.upload_url).origin}. Detalhe: ${netErr?.message || "erro desconhecido"}`
          );
        }
        if (!putRes.ok) {
          const errBody = await putRes.text().catch(() => "");
          console.error("Upload HTTP error:", putRes.status, errBody);
          throw new Error(`Upload falhou (HTTP ${putRes.status}). ${errBody}`);
        }
        setUploadStatus("");
        toast({ title: "Upload concluido com sucesso", description: file.name });
      }
      resetForm();
      await onRefresh();
    } catch (e: any) {
      console.error("LMS upload error:", e);
      toast({ title: "Erro no upload", description: e?.message || "Erro desconhecido" });
    } finally {
      setSaving(false);
      setUploadStatus("");
    }
  }

  async function onDelete(id: string) {
    try {
      await deleteContent(id);
      toast({ title: "Conteudo removido" });
      await onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onSaveEdit(id: string) {
    try {
      await updateContent(id, { title: editTitle.trim(), description: editDescription.trim() });
      toast({ title: "Conteudo atualizado" });
      setEditingId(null);
      await onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onOpen(c: ContentOut) {
    try {
      if (c.url) { window.open(c.url, "_blank"); return; }
      const acc = await getContentAccess(c.id);
      window.open(acc.access_url, "_blank");
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex gap-3 flex-1 w-full md:w-auto">
          <Input
            placeholder="Buscar conteudo..."
            value={contentSearch}
            onChange={(e) => setContentSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="link">Link</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => { setShowForm(!showForm); }}>
          {showForm ? "Cancelar" : "Novo Conteudo"}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo Conteudo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant={formMode === "link" ? "default" : "outline"} size="sm" onClick={() => setFormMode("link")}>
                Link Externo
              </Button>
              <Button variant={formMode === "upload" ? "default" : "outline"} size="sm" onClick={() => setFormMode("upload")}>
                Upload (Video/PDF)
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Titulo *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Treinamento NR-1" />
              </div>
              {formMode === "link" ? (
                <div className="space-y-2">
                  <Label>URL *</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Arquivo *</Label>
                  <Input type="file" accept="video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  {file && (
                    <p className="text-xs text-muted-foreground">
                      Selecionado: <span className="font-medium text-foreground">{file.name}</span> ({(file.size / 1024 / 1024).toFixed(1)} MB)
                    </p>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>Descricao</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Descricao opcional" />
              </div>
              <div className="space-y-2">
                <Label>Duracao (min)</Label>
                <Input type="number" value={durationMin} onChange={(e) => setDurationMin(e.target.value)} placeholder="Ex: 30" />
              </div>
            </div>
            {isPlatformAdmin && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
                Conteudo oficial da plataforma
              </label>
            )}
            <div className="flex gap-2 items-center">
              <Button onClick={onSave} disabled={saving}>
                {saving ? (uploadStatus || "Salvando...") : "Salvar"}
              </Button>
              <Button variant="ghost" onClick={resetForm} disabled={saving}>Cancelar</Button>
              {saving && uploadStatus && (
                <span className="text-sm text-muted-foreground animate-pulse">{uploadStatus}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Biblioteca de Conteudos</span>
            <Badge variant="secondary">{contents.length} itens</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titulo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Duracao</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contents.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {editingId === c.id ? (
                      <div className="space-y-1">
                        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8" />
                        <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} className="h-8" placeholder="Descricao" />
                      </div>
                    ) : (
                      <div>
                        <p className="font-medium">{c.title}</p>
                        {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{TYPE_LABELS[c.content_type] || c.content_type}</Badge>
                  </TableCell>
                  <TableCell>{c.duration_minutes ? `${c.duration_minutes} min` : "-"}</TableCell>
                  <TableCell>
                    {c.is_platform_managed ? (
                      <Badge className="bg-purple-100 text-purple-800">Oficial</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Tenant</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {editingId === c.id ? (
                        <>
                          <Button variant="outline" size="sm" onClick={() => onSaveEdit(c.id)}>Salvar</Button>
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancelar</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" onClick={() => onOpen(c)}>Abrir</Button>
                          <Button variant="outline" size="sm" onClick={() => { setEditingId(c.id); setEditTitle(c.title); setEditDescription(c.description || ""); }}>Editar</Button>
                          <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => onDelete(c.id)}>Remover</Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {contents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum conteudo cadastrado. Clique em "Novo Conteudo" para comecar.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Learning Path Tab
// ═══════════════════════════════════════════════════════════════════════════════

function LearningPathTab({
  paths,
  contents,
  toast,
  onRefresh,
}: {
  paths: LearningPathOut[];
  contents: ContentOut[];
  toast: any;
  onRefresh: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingPathId, setEditingPathId] = useState<string | null>(null);
  const [pathTitle, setPathTitle] = useState("");
  const [pathDesc, setPathDesc] = useState("");
  const [selectedContentIds, setSelectedContentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function startEdit(p: LearningPathOut) {
    setEditingPathId(p.id);
    setPathTitle(p.title);
    setPathDesc(p.description || "");
    setSelectedContentIds(
      [...p.items].sort((a, b) => a.order_index - b.order_index).map((i) => i.content_item_id)
    );
    setShowForm(true);
  }

  function resetForm() {
    setEditingPathId(null);
    setPathTitle("");
    setPathDesc("");
    setSelectedContentIds([]);
    setShowForm(false);
  }

  function toggleContent(id: string) {
    setSelectedContentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function moveItem(idx: number, dir: -1 | 1) {
    setSelectedContentIds((prev) => {
      const arr = [...prev];
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }

  async function onSavePath() {
    if (!pathTitle.trim()) { toast({ title: "Titulo obrigatorio" }); return; }
    if (selectedContentIds.length === 0) { toast({ title: "Selecione ao menos um conteudo" }); return; }
    setSaving(true);
    try {
      if (editingPathId) {
        await updateLearningPath(editingPathId, {
          title: pathTitle.trim(),
          description: pathDesc.trim() || undefined,
          content_item_ids: selectedContentIds,
        });
        toast({ title: "Trilha atualizada com sucesso" });
      } else {
        await createLearningPath({
          title: pathTitle.trim(),
          description: pathDesc.trim() || undefined,
          content_item_ids: selectedContentIds,
        });
        toast({ title: "Trilha criada com sucesso" });
      }
      resetForm();
      await onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    } finally {
      setSaving(false);
    }
  }

  async function onDeletePath(id: string) {
    try {
      await deleteLearningPath(id);
      toast({ title: "Trilha removida" });
      await onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  return (
    <>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Trilhas de Aprendizagem</h2>
          <p className="text-sm text-muted-foreground">Agrupe conteudos em trilhas sequenciais para seus colaboradores</p>
        </div>
        <Button onClick={() => { if (showForm) { resetForm(); } else { setEditingPathId(null); setShowForm(true); } }}>
          {showForm ? "Cancelar" : "Nova Trilha"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">{editingPathId ? "Editar Trilha" : "Nova Trilha"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Titulo *</Label>
                <Input value={pathTitle} onChange={(e) => setPathTitle(e.target.value)} placeholder="Ex: Onboarding NR-1" />
              </div>
              <div className="space-y-2">
                <Label>Descricao</Label>
                <Textarea value={pathDesc} onChange={(e) => setPathDesc(e.target.value)} rows={2} placeholder="Descricao opcional" />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Selecione os conteudos (clique para adicionar/remover)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto border rounded p-2">
                {contents.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`text-left px-3 py-2 rounded text-sm transition-colors ${
                      selectedContentIds.includes(c.id)
                        ? "bg-blue-100 dark:bg-blue-900 border-blue-300 dark:border-blue-700 border text-blue-900 dark:text-blue-100"
                        : "bg-muted border border-transparent hover:bg-accent text-foreground"
                    }`}
                    onClick={() => toggleContent(c.id)}
                  >
                    <span className="font-medium">{c.title}</span>
                    <span className="text-muted-foreground ml-2">({TYPE_LABELS[c.content_type] || c.content_type})</span>
                  </button>
                ))}
                {contents.length === 0 && <p className="text-sm text-muted-foreground p-2">Nenhum conteudo disponivel</p>}
              </div>
            </div>

            {selectedContentIds.length > 0 && (
              <div className="space-y-2">
                <Label>Ordem da Trilha</Label>
                <div className="space-y-1">
                  {selectedContentIds.map((id, idx) => {
                    const c = contents.find((x) => x.id === id);
                    return (
                      <div key={id} className="flex items-center gap-2 bg-muted rounded px-3 py-2">
                        <span className="text-sm font-medium text-blue-600 w-6">{idx + 1}.</span>
                        <span className="text-sm flex-1">{c?.title || shortId(id)}</span>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveItem(idx, -1)} disabled={idx === 0}>
                            ↑
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => moveItem(idx, 1)} disabled={idx === selectedContentIds.length - 1}>
                            ↓
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => toggleContent(id)}>
                            ×
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={onSavePath} disabled={saving}>
                {saving
                  ? (editingPathId ? "Salvando..." : "Criando...")
                  : (editingPathId ? "Salvar Alteracoes" : "Criar Trilha")}
              </Button>
              <Button variant="ghost" onClick={resetForm}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Path List */}
      <div className="grid gap-4">
        {paths.map((p) => (
          <Card key={p.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{p.title}</CardTitle>
                  {p.description && <p className="text-sm text-muted-foreground mt-1">{p.description}</p>}
                </div>
                <div className="flex gap-2 items-center">
                  <Badge variant="secondary">{p.items.length} conteudo{p.items.length !== 1 ? "s" : ""}</Badge>
                  {p.is_platform_managed && <Badge className="bg-purple-100 text-purple-800">Oficial</Badge>}
                  <Button variant="outline" size="sm" onClick={() => startEdit(p)}>Editar</Button>
                  <Button variant="outline" size="sm" className="text-red-600" onClick={() => onDeletePath(p.id)}>Remover</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {p.items.length > 0 ? (
                <div className="space-y-1">
                  {p.items.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 flex items-center justify-center text-xs font-semibold">
                        {idx + 1}
                      </span>
                      <span>{item.content_title || shortId(item.content_item_id)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Trilha sem conteudos</p>
              )}
            </CardContent>
          </Card>
        ))}
        {paths.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma trilha criada. Clique em "Nova Trilha" para montar uma sequencia de aprendizagem.
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Assignment Tab
// ═══════════════════════════════════════════════════════════════════════════════

function AssignmentTab({
  assignments,
  assignmentTotal,
  assignStatusFilter,
  setAssignStatusFilter,
  contents,
  paths,
  employees,
  orgUnits,
  employeeMap,
  unitMap,
  contentMap,
  toast,
  onRefresh,
}: {
  assignments: LMSAssignmentOut[];
  assignmentTotal: number;
  assignStatusFilter: string;
  setAssignStatusFilter: (v: string) => void;
  contents: ContentOut[];
  paths: LearningPathOut[];
  employees: EmployeeOut[];
  orgUnits: OrgUnitOut[];
  employeeMap: Record<string, string>;
  unitMap: Record<string, string>;
  contentMap: Record<string, string>;
  toast: any;
  onRefresh: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"single" | "bulk">("single");

  // Single assignment
  const [assignContentId, setAssignContentId] = useState("");
  const [assignPathId, setAssignPathId] = useState("");
  const [assignEmployeeId, setAssignEmployeeId] = useState("");
  const [assignOrgUnitId, setAssignOrgUnitId] = useState("");
  const [assignTarget, setAssignTarget] = useState<"employee" | "unit">("employee");
  const [assignSource, setAssignSource] = useState<"content" | "path">("content");

  // Bulk
  const [bulkContentId, setBulkContentId] = useState("");
  const [bulkPathId, setBulkPathId] = useState("");
  const [bulkSource, setBulkSource] = useState<"content" | "path">("content");
  const [bulkEmployeeIds, setBulkEmployeeIds] = useState<string[]>([]);
  const [bulkOrgUnitIds, setBulkOrgUnitIds] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);

  const pathMap = useMemo(() => {
    const m: Record<string, string> = {};
    paths.forEach((p) => { m[p.id] = p.title; });
    return m;
  }, [paths]);

  function resetForm() {
    setAssignContentId(""); setAssignPathId(""); setAssignEmployeeId(""); setAssignOrgUnitId("");
    setBulkContentId(""); setBulkPathId(""); setBulkEmployeeIds([]); setBulkOrgUnitIds([]);
    setShowForm(false);
  }

  async function onCreateSingle() {
    const payload: any = {};
    if (assignSource === "content") {
      if (!assignContentId) { toast({ title: "Selecione um conteudo" }); return; }
      payload.content_item_id = assignContentId;
    } else {
      if (!assignPathId) { toast({ title: "Selecione uma trilha" }); return; }
      payload.learning_path_id = assignPathId;
    }
    if (assignTarget === "employee") {
      if (!assignEmployeeId) { toast({ title: "Selecione um colaborador" }); return; }
      payload.employee_id = assignEmployeeId;
    } else {
      if (!assignOrgUnitId) { toast({ title: "Selecione uma unidade" }); return; }
      payload.org_unit_id = assignOrgUnitId;
    }
    setSaving(true);
    try {
      await createAssignment(payload);
      toast({ title: "Atribuicao criada" });
      resetForm();
      await onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    } finally {
      setSaving(false);
    }
  }

  async function onCreateBulk() {
    const payload: any = {};
    if (bulkSource === "content") {
      if (!bulkContentId) { toast({ title: "Selecione um conteudo" }); return; }
      payload.content_item_id = bulkContentId;
    } else {
      if (!bulkPathId) { toast({ title: "Selecione uma trilha" }); return; }
      payload.learning_path_id = bulkPathId;
    }
    if (bulkEmployeeIds.length === 0 && bulkOrgUnitIds.length === 0) {
      toast({ title: "Selecione ao menos um alvo" }); return;
    }
    if (bulkEmployeeIds.length > 0) payload.employee_ids = bulkEmployeeIds;
    if (bulkOrgUnitIds.length > 0) payload.org_unit_ids = bulkOrgUnitIds;
    setSaving(true);
    try {
      const res = await bulkCreateAssignments(payload);
      toast({ title: `${res.created} atribuicao(oes) criada(s)` });
      resetForm();
      await onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    } finally {
      setSaving(false);
    }
  }

  async function onComplete(assignmentId: string) {
    try {
      await createCompletion({ assignment_id: assignmentId, completion_method: "manual" });
      toast({ title: "Conclusao registrada" });
      await onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onDeleteAssignment(id: string) {
    try {
      await deleteAssignment(id);
      toast({ title: "Atribuicao removida" });
      await onRefresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  function toggleBulkEmployee(id: string) {
    setBulkEmployeeIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function toggleBulkUnit(id: string) {
    setBulkOrgUnitIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  return (
    <>
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex gap-3 items-center">
          <Select value={assignStatusFilter} onValueChange={setAssignStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Status</SelectItem>
              <SelectItem value="assigned">Atribuido</SelectItem>
              <SelectItem value="in_progress">Em Andamento</SelectItem>
              <SelectItem value="completed">Concluido</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="secondary">{assignmentTotal} total</Badge>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "Nova Atribuicao"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova Atribuicao</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant={formMode === "single" ? "default" : "outline"} size="sm" onClick={() => setFormMode("single")}>
                Individual
              </Button>
              <Button variant={formMode === "bulk" ? "default" : "outline"} size="sm" onClick={() => setFormMode("bulk")}>
                Em Massa
              </Button>
            </div>

            <Separator />

            {formMode === "single" ? (
              <div className="space-y-4">
                {/* Source */}
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <div className="flex gap-2">
                    <Button variant={assignSource === "content" ? "default" : "outline"} size="sm" onClick={() => setAssignSource("content")}>Conteudo</Button>
                    <Button variant={assignSource === "path" ? "default" : "outline"} size="sm" onClick={() => setAssignSource("path")}>Trilha</Button>
                  </div>
                  {assignSource === "content" ? (
                    <Select value={assignContentId} onValueChange={setAssignContentId}>
                      <SelectTrigger><SelectValue placeholder="Selecione o conteudo" /></SelectTrigger>
                      <SelectContent>
                        {contents.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={assignPathId} onValueChange={setAssignPathId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a trilha" /></SelectTrigger>
                      <SelectContent>
                        {paths.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Target */}
                <div className="space-y-2">
                  <Label>Alvo</Label>
                  <div className="flex gap-2">
                    <Button variant={assignTarget === "employee" ? "default" : "outline"} size="sm" onClick={() => setAssignTarget("employee")}>Colaborador</Button>
                    <Button variant={assignTarget === "unit" ? "default" : "outline"} size="sm" onClick={() => setAssignTarget("unit")}>Unidade/Setor</Button>
                  </div>
                  {assignTarget === "employee" ? (
                    <Select value={assignEmployeeId} onValueChange={setAssignEmployeeId}>
                      <SelectTrigger><SelectValue placeholder="Selecione o colaborador" /></SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name} ({e.identifier})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={assignOrgUnitId} onValueChange={setAssignOrgUnitId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                      <SelectContent>
                        {orgUnits.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <Button onClick={onCreateSingle} disabled={saving}>{saving ? "Criando..." : "Criar Atribuicao"}</Button>
              </div>
            ) : (
              /* Bulk mode */
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <div className="flex gap-2">
                    <Button variant={bulkSource === "content" ? "default" : "outline"} size="sm" onClick={() => setBulkSource("content")}>Conteudo</Button>
                    <Button variant={bulkSource === "path" ? "default" : "outline"} size="sm" onClick={() => setBulkSource("path")}>Trilha</Button>
                  </div>
                  {bulkSource === "content" ? (
                    <Select value={bulkContentId} onValueChange={setBulkContentId}>
                      <SelectTrigger><SelectValue placeholder="Selecione o conteudo" /></SelectTrigger>
                      <SelectContent>
                        {contents.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={bulkPathId} onValueChange={setBulkPathId}>
                      <SelectTrigger><SelectValue placeholder="Selecione a trilha" /></SelectTrigger>
                      <SelectContent>
                        {paths.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Colaboradores ({bulkEmployeeIds.length} selecionado{bulkEmployeeIds.length !== 1 ? "s" : ""})</Label>
                    <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
                      {employees.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          className={`w-full text-left px-2 py-1 rounded text-sm ${
                            bulkEmployeeIds.includes(e.id) ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100" : "hover:bg-accent text-foreground"
                          }`}
                          onClick={() => toggleBulkEmployee(e.id)}
                        >
                          {e.full_name}
                        </button>
                      ))}
                      {employees.length === 0 && <p className="text-sm text-muted-foreground">Nenhum colaborador</p>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Unidades/Setores ({bulkOrgUnitIds.length} selecionado{bulkOrgUnitIds.length !== 1 ? "s" : ""})</Label>
                    <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
                      {orgUnits.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className={`w-full text-left px-2 py-1 rounded text-sm ${
                            bulkOrgUnitIds.includes(u.id) ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100" : "hover:bg-accent text-foreground"
                          }`}
                          onClick={() => toggleBulkUnit(u.id)}
                        >
                          {u.name}
                        </button>
                      ))}
                      {orgUnits.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma unidade</p>}
                    </div>
                  </div>
                </div>

                <Button onClick={onCreateBulk} disabled={saving}>{saving ? "Criando..." : "Criar Atribuicoes em Massa"}</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Assignment Table */}
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conteudo / Trilha</TableHead>
                <TableHead>Alvo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => {
                const label = a.content_item_id
                  ? contentMap[a.content_item_id] || shortId(a.content_item_id)
                  : a.learning_path_id
                    ? pathMap[a.learning_path_id] || shortId(a.learning_path_id)
                    : "-";
                const target = a.employee_id
                  ? employeeMap[a.employee_id] || shortId(a.employee_id)
                  : a.org_unit_id
                    ? unitMap[a.org_unit_id] || shortId(a.org_unit_id)
                    : "-";
                const targetType = a.employee_id ? "Colaborador" : "Unidade";
                const pctDone = a.duration_seconds && a.duration_seconds > 0
                  ? Math.min(100, Math.round(((a.progress_seconds || 0) / a.duration_seconds) * 100))
                  : null;

                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-xs text-muted-foreground">{a.content_item_id ? "Conteudo" : "Trilha"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{target}</p>
                        <p className="text-xs text-muted-foreground">{targetType}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLORS[a.status] || ""}>{a.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.due_at ? new Date(a.due_at).toLocaleDateString("pt-BR") : "-"}
                    </TableCell>
                    <TableCell>
                      {a.completed_at ? (
                        <span className="text-green-700 text-sm font-medium">Concluido</span>
                      ) : pctDone !== null ? (
                        <div className="flex items-center gap-2">
                          <Progress value={pctDone} className="h-2 w-20" />
                          <span className="text-xs">{pctDone}%</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {a.status !== "completed" && (
                          <Button variant="outline" size="sm" onClick={() => onComplete(a.id)}>Concluir</Button>
                        )}
                        <Button variant="outline" size="sm" className="text-red-600" onClick={() => onDeleteAssignment(a.id)}>Remover</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {assignments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma atribuicao encontrada. Crie atribuicoes para designar conteudos aos colaboradores.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
