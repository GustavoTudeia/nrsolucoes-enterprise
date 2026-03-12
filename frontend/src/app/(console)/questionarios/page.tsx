"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import {
  createTemplate,
  createVersion,
  publishVersion,
  listTemplates,
  listVersions,
  type QuestionnaireTemplateDetailOut,
  type QuestionnaireVersionDetailOut,
} from "@/lib/api/questionnaires";

// ─── Types ───────────────────────────────────────────────────────────────────

type Dimension = { key: string; name: string };
type Question = {
  id: string;
  text: string;
  dimension: string;
  weight: number;
  scale_min: number;
  scale_max: number;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_DIMENSIONS: Dimension[] = [
  { key: "workload", name: "Carga de trabalho" },
  { key: "support", name: "Suporte e lideranca" },
  { key: "autonomy", name: "Autonomia" },
  { key: "recognition", name: "Reconhecimento" },
];

const DEFAULT_QUESTIONS: Question[] = [
  { id: "q1", dimension: "workload", text: "Tenho tempo suficiente para cumprir minhas tarefas.", weight: 1, scale_min: 1, scale_max: 5 },
  { id: "q2", dimension: "support", text: "Recebo suporte adequado do meu gestor.", weight: 1, scale_min: 1, scale_max: 5 },
];

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  published: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

function safeKey(s: string) {
  return s.toLowerCase().trim().replace(/\s+/g, "_").replace(/[^a-z0-9_\-]/g, "");
}

function shortDate(s?: string | null) {
  if (!s) return "-";
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function QuestionariosPage() {
  const { me } = useConsole();
  const canPlatform = !!me?.is_platform_admin;

  const [activeTab, setActiveTab] = useState("templates");
  const [loading, setLoading] = useState(true);

  // Data
  const [templates, setTemplates] = useState<QuestionnaireTemplateDetailOut[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [versions, setVersions] = useState<QuestionnaireVersionDetailOut[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");

  // Builder state
  const [title, setTitle] = useState("NR-1 - Questionario Psicossocial");
  const [dimensions, setDimensions] = useState<Dimension[]>(DEFAULT_DIMENSIONS);
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);
  const [jsonText, setJsonText] = useState("");

  // Template create
  const [tplKey, setTplKey] = useState("nr1_psicossocial");
  const [tplName, setTplName] = useState("NR-1 Psicossocial");
  const [tplDesc, setTplDesc] = useState("Template parametrizavel para diagnostico setorizado com agregacao LGPD.");
  const [tplPlatform, setTplPlatform] = useState(false);

  // ─── Content memo ──────────────────────────────────────────────────────────

  const content = useMemo(() => ({
    title,
    dimensions,
    questions: questions.map((q) => ({
      id: q.id, dimension: q.dimension, text: q.text,
      weight: q.weight, scale_min: q.scale_min, scale_max: q.scale_max,
    })),
  }), [title, dimensions, questions]);

  useEffect(() => {
    setJsonText(JSON.stringify(content, null, 2));
  }, [content]);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const refreshTemplates = useCallback(async () => {
    try {
      const r = await listTemplates({ limit: 200, offset: 0 });
      setTemplates(r.items);
      if (!selectedTemplateId && r.items[0]?.id) setSelectedTemplateId(r.items[0].id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar templates");
    }
  }, [selectedTemplateId]);

  const refreshVersions = useCallback(async (templateId: string) => {
    try {
      const r = await listVersions(templateId, { limit: 200, offset: 0 });
      setVersions(r.items);
      const pub = r.items.find((x) => x.status === "published");
      if (!selectedVersionId && pub?.id) setSelectedVersionId(pub.id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar versoes");
    }
  }, [selectedVersionId]);

  useEffect(() => {
    setLoading(true);
    refreshTemplates().finally(() => setLoading(false));
  }, [refreshTemplates]);

  useEffect(() => {
    if (selectedTemplateId) refreshVersions(selectedTemplateId);
  }, [selectedTemplateId, refreshVersions]);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  const selectedVersion = useMemo(
    () => versions.find((v) => v.id === selectedVersionId),
    [versions, selectedVersionId]
  );

  const publishedCount = useMemo(
    () => versions.filter((v) => v.status === "published").length,
    [versions]
  );

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function onCreateTemplate() {
    try {
      const r = await createTemplate({
        key: safeKey(tplKey),
        name: tplName,
        description: tplDesc,
        is_platform_managed: canPlatform ? tplPlatform : false,
      });
      toast.success("Template criado com sucesso");
      await refreshTemplates();
      setSelectedTemplateId(r.id);
      setActiveTab("templates");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar template");
    }
  }

  async function onCreateVersionFromBuilder() {
    try {
      if (!selectedTemplateId) throw new Error("Selecione um template primeiro");
      if (questions.length === 0) throw new Error("Adicione ao menos uma pergunta");
      const ids = new Set<string>();
      for (const q of questions) {
        if (!q.id) throw new Error("Toda pergunta precisa de um ID");
        if (ids.has(q.id)) throw new Error(`ID duplicado: ${q.id}`);
        ids.add(q.id);
        if (!q.dimension) throw new Error(`Pergunta ${q.id} sem dimensao`);
        if (!dimensions.some((d) => d.key === q.dimension)) throw new Error(`Dimensao inexistente: ${q.dimension}`);
      }
      const r = await createVersion(selectedTemplateId, { content });
      toast.success("Versao criada (draft)");
      await refreshVersions(selectedTemplateId);
      setSelectedVersionId(r.id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar versao");
    }
  }

  async function onCreateVersionFromJson() {
    try {
      if (!selectedTemplateId) throw new Error("Selecione um template primeiro");
      const parsed = JSON.parse(jsonText);
      const r = await createVersion(selectedTemplateId, { content: parsed });
      toast.success("Versao criada (draft)");
      await refreshVersions(selectedTemplateId);
      setSelectedVersionId(r.id);
    } catch (e: any) {
      toast.error(e?.message || "JSON invalido ou falha ao criar versao");
    }
  }

  async function onPublish(versionId: string) {
    try {
      const r = await publishVersion(versionId);
      toast.success("Versao publicada com sucesso");
      if (selectedTemplateId) await refreshVersions(selectedTemplateId);
      setSelectedVersionId(r.id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao publicar");
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Questionarios</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Templates, versionamento e builder para diagnosticos NR-1 psicossociais
          </p>
        </div>
        <Button variant="outline" onClick={() => { refreshTemplates(); if (selectedTemplateId) refreshVersions(selectedTemplateId); }} disabled={loading}>
          {loading ? "Carregando..." : "Atualizar"}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Templates</p>
            <p className="text-3xl font-bold mt-1 text-blue-600">{templates.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Versoes (atual)</p>
            <p className="text-3xl font-bold mt-1 text-indigo-600">{versions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Publicadas</p>
            <p className="text-3xl font-bold mt-1 text-green-600">{publishedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Dimensoes (builder)</p>
            <p className="text-3xl font-bold mt-1 text-amber-600">{dimensions.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Template + Version Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="font-medium">Template ativo</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.key}){t.is_platform_managed ? " - Oficial" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTemplate && (
                <div className="flex items-center gap-2 mt-1">
                  {selectedTemplate.is_platform_managed && (
                    <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Oficial</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">Criado em {shortDate(selectedTemplate.created_at)}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="font-medium">Versao</Label>
              <Select value={selectedVersionId} onValueChange={setSelectedVersionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma versao" />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      v{v.version} - {v.status}{v.published_at ? ` (${shortDate(v.published_at)})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVersion && (
                <div className="flex items-center gap-2 mt-1">
                  <Badge className={STATUS_STYLE[selectedVersion.status] || ""}>{selectedVersion.status}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {selectedVersion.status === "draft" ? "Publique para usar em campanhas" : "Pronta para campanhas"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
          <TabsTrigger value="versions">Versoes</TabsTrigger>
        </TabsList>

        {/* ═══════ TAB: Templates ═══════ */}
        <TabsContent value="templates" className="space-y-6 mt-6">
          <TemplatesTab
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            setSelectedTemplateId={setSelectedTemplateId}
            canPlatform={canPlatform}
            tplKey={tplKey} setTplKey={setTplKey}
            tplName={tplName} setTplName={setTplName}
            tplDesc={tplDesc} setTplDesc={setTplDesc}
            tplPlatform={tplPlatform} setTplPlatform={setTplPlatform}
            onCreateTemplate={onCreateTemplate}
          />
        </TabsContent>

        {/* ═══════ TAB: Builder ═══════ */}
        <TabsContent value="builder" className="space-y-6 mt-6">
          <BuilderTab
            title={title} setTitle={setTitle}
            dimensions={dimensions} setDimensions={setDimensions}
            questions={questions} setQuestions={setQuestions}
            selectedTemplateId={selectedTemplateId}
            onCreateVersion={onCreateVersionFromBuilder}
            jsonText={jsonText}
          />
        </TabsContent>

        {/* ═══════ TAB: JSON ═══════ */}
        <TabsContent value="json" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Editor JSON Avancado</CardTitle>
                  <CardDescription>Para equipes com governanca tecnica. Edite o conteudo diretamente.</CardDescription>
                </div>
                <Badge variant="outline">Avancado</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                className="font-mono text-xs min-h-[400px] bg-muted/30"
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button onClick={onCreateVersionFromJson} disabled={!selectedTemplateId}>
                  Criar versao (draft)
                </Button>
                <Button variant="outline" onClick={() => setJsonText(JSON.stringify(content, null, 2))}>
                  Regerar do Builder
                </Button>
                <Button variant="outline" onClick={() => { navigator.clipboard.writeText(jsonText); toast.success("JSON copiado"); }}>
                  Copiar
                </Button>
              </div>
              {!selectedTemplateId && (
                <p className="text-sm text-amber-600 dark:text-amber-400">Selecione um template antes de criar uma versao.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════ TAB: Versoes ═══════ */}
        <TabsContent value="versions" className="space-y-6 mt-6">
          <VersionsTab
            versions={versions}
            selectedVersionId={selectedVersionId}
            setSelectedVersionId={setSelectedVersionId}
            onPublish={onPublish}
            selectedTemplateId={selectedTemplateId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Templates Tab
// ═══════════════════════════════════════════════════════════════════════════════

function TemplatesTab({
  templates, selectedTemplateId, setSelectedTemplateId,
  canPlatform, tplKey, setTplKey, tplName, setTplName, tplDesc, setTplDesc,
  tplPlatform, setTplPlatform, onCreateTemplate,
}: {
  templates: QuestionnaireTemplateDetailOut[];
  selectedTemplateId: string;
  setSelectedTemplateId: (v: string) => void;
  canPlatform: boolean;
  tplKey: string; setTplKey: (v: string) => void;
  tplName: string; setTplName: (v: string) => void;
  tplDesc: string; setTplDesc: (v: string) => void;
  tplPlatform: boolean; setTplPlatform: (v: boolean) => void;
  onCreateTemplate: () => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Templates de Questionarios</h2>
          <p className="text-sm text-muted-foreground">Gerencie os modelos base para seus diagnosticos organizacionais</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancelar" : "Novo Template"}
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo Template</CardTitle>
            <CardDescription>Crie um modelo base. Versoes serao adicionadas a partir do Builder ou JSON.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Key (identificador unico) *</Label>
                <Input value={tplKey} onChange={(e) => setTplKey(e.target.value)} placeholder="nr1_psicossocial" />
                <p className="text-xs text-muted-foreground">Gerado automaticamente: {safeKey(tplKey)}</p>
              </div>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="NR-1 Psicossocial" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Descricao</Label>
                <Textarea value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} rows={2} placeholder="Descricao do template" />
              </div>
            </div>
            {canPlatform && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={tplPlatform} onChange={(e) => setTplPlatform(e.target.checked)} className="rounded" />
                Template oficial da plataforma (platform managed)
              </label>
            )}
            <div className="flex gap-2">
              <Button onClick={onCreateTemplate}>Criar Template</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Templates Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>Templates Cadastrados</span>
            <Badge variant="secondary">{templates.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id} className={t.id === selectedTemplateId ? "bg-muted/50" : ""}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{t.name}</p>
                      {t.description && <p className="text-xs text-muted-foreground line-clamp-1">{t.description}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.key}</code>
                  </TableCell>
                  <TableCell>
                    {t.is_platform_managed ? (
                      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">Oficial</Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">Tenant</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{shortDate(t.created_at)}</TableCell>
                  <TableCell>
                    <Badge variant={t.is_active ? "default" : "outline"}>
                      {t.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant={t.id === selectedTemplateId ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedTemplateId(t.id)}
                    >
                      {t.id === selectedTemplateId ? "Selecionado" : "Selecionar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {templates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum template cadastrado. Crie o primeiro para comecar.
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
// Builder Tab
// ═══════════════════════════════════════════════════════════════════════════════

function BuilderTab({
  title, setTitle,
  dimensions, setDimensions,
  questions, setQuestions,
  selectedTemplateId,
  onCreateVersion,
  jsonText,
}: {
  title: string; setTitle: (v: string) => void;
  dimensions: Dimension[]; setDimensions: React.Dispatch<React.SetStateAction<Dimension[]>>;
  questions: Question[]; setQuestions: React.Dispatch<React.SetStateAction<Question[]>>;
  selectedTemplateId: string;
  onCreateVersion: () => Promise<void>;
  jsonText: string;
}) {
  const questionsByDimension = useMemo(() => {
    const m: Record<string, Question[]> = {};
    dimensions.forEach((d) => { m[d.key] = []; });
    questions.forEach((q) => {
      if (m[q.dimension]) m[q.dimension].push(q);
    });
    return m;
  }, [dimensions, questions]);

  const questionsWithoutDim = useMemo(
    () => questions.filter((q) => !dimensions.some((d) => d.key === q.dimension)),
    [questions, dimensions]
  );

  return (
    <>
      {/* Header Bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Builder Visual</h2>
          <p className="text-sm text-muted-foreground">Monte dimensoes e perguntas de forma guiada</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(jsonText); toast.success("JSON copiado"); }}>
            Copiar JSON
          </Button>
          <Button onClick={onCreateVersion} disabled={!selectedTemplateId}>
            Criar versao (draft)
          </Button>
        </div>
      </div>

      {!selectedTemplateId && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardContent className="py-4">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Selecione um template na aba "Templates" antes de criar versoes.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Title */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <Label className="font-medium">Titulo do Questionario</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg" placeholder="Ex: NR-1 - Questionario Psicossocial" />
          </div>
        </CardContent>
      </Card>

      {/* Dimensions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Dimensoes</CardTitle>
              <CardDescription>Categorias avaliadas pelo questionario. Cada pergunta pertence a uma dimensao.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{dimensions.length} dimensao(oes)</Badge>
              <Button
                size="sm"
                onClick={() => setDimensions((prev) => [...prev, { key: `dim_${prev.length + 1}`, name: "Nova dimensao" }])}
              >
                Adicionar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {dimensions.map((d, idx) => (
              <div key={`${d.key}_${idx}`} className="flex items-center gap-3 bg-muted/40 rounded-lg px-4 py-3">
                <span className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 flex items-center justify-center text-sm font-bold shrink-0">
                  {idx + 1}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
                  <div className="space-y-1">
                    <span className="text-xs text-muted-foreground">Key</span>
                    <Input
                      value={d.key}
                      onChange={(e) => setDimensions((prev) => prev.map((x, i) => (i === idx ? { ...x, key: safeKey(e.target.value) } : x)))}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <span className="text-xs text-muted-foreground">Nome</span>
                    <Input
                      value={d.name}
                      onChange={(e) => setDimensions((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs">{questionsByDimension[d.key]?.length || 0} perguntas</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600 h-8 w-8 p-0"
                    onClick={() => {
                      const k = d.key;
                      setDimensions((prev) => prev.filter((_, i) => i !== idx));
                      setQuestions((prev) => prev.map((q) => (q.dimension === k ? { ...q, dimension: "" } : q)));
                    }}
                  >
                    x
                  </Button>
                </div>
              </div>
            ))}
            {dimensions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma dimensao. Adicione para categorizar as perguntas.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Questions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Perguntas</CardTitle>
              <CardDescription>Itens do questionario com peso e escala configuravel</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{questions.length} pergunta(s)</Badge>
              <Button
                size="sm"
                onClick={() =>
                  setQuestions((prev) => [
                    ...prev,
                    { id: `q${prev.length + 1}`, dimension: dimensions[0]?.key || "", text: "Nova pergunta", weight: 1, scale_min: 1, scale_max: 5 },
                  ])
                }
              >
                Adicionar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div key={`${q.id}_${idx}`} className="rounded-lg border p-4 space-y-3 hover:border-foreground/20 transition-colors">
                {/* Row 1: ID + Dimension + Remove */}
                <div className="flex items-start gap-3">
                  <span className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-200 flex items-center justify-center text-sm font-bold shrink-0 mt-1">
                    {idx + 1}
                  </span>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 flex-1">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">ID</span>
                      <Input
                        value={q.id}
                        onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, id: safeKey(e.target.value) || x.id } : x)))}
                        className="h-9 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Dimensao</span>
                      <Select
                        value={q.dimension}
                        onValueChange={(v) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, dimension: v } : x)))}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {dimensions.map((d) => (
                            <SelectItem key={d.key} value={d.key}>{d.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 md:col-span-2">
                      <span className="text-xs text-muted-foreground">Texto da pergunta</span>
                      <Textarea
                        value={q.text}
                        onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)))}
                        rows={2}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 2: Weight + Scale */}
                <div className="flex items-end gap-3 ml-11">
                  <div className="grid grid-cols-3 gap-3 flex-1">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Peso</span>
                      <Input
                        type="number"
                        value={q.weight}
                        onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, weight: Number(e.target.value) || 1 } : x)))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Escala min</span>
                      <Input
                        type="number"
                        value={q.scale_min}
                        onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, scale_min: Number(e.target.value) || 1 } : x)))}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground">Escala max</span>
                      <Input
                        type="number"
                        value={q.scale_max}
                        onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, scale_max: Number(e.target.value) || 5 } : x)))}
                        className="h-9"
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ))}

            {questionsWithoutDim.length > 0 && (
              <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 p-3">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {questionsWithoutDim.length} pergunta(s) sem dimensao valida. Atribua uma dimensao antes de criar a versao.
                </p>
              </div>
            )}

            {questions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhuma pergunta. Adicione perguntas para montar o questionario.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">Resumo:</span>{" "}
              <span className="text-muted-foreground">
                {dimensions.length} dimensao(oes), {questions.length} pergunta(s)
                {dimensions.length > 0 && (
                  <> — {dimensions.map((d) => `${d.name} (${questionsByDimension[d.key]?.length || 0})`).join(", ")}</>
                )}
              </span>
            </div>
            <Button onClick={onCreateVersion} disabled={!selectedTemplateId}>
              Criar versao (draft)
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Versions Tab
// ═══════════════════════════════════════════════════════════════════════════════

function VersionsTab({
  versions, selectedVersionId, setSelectedVersionId, onPublish, selectedTemplateId,
}: {
  versions: QuestionnaireVersionDetailOut[];
  selectedVersionId: string;
  setSelectedVersionId: (v: string) => void;
  onPublish: (versionId: string) => Promise<void>;
  selectedTemplateId: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!selectedTemplateId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Selecione um template para visualizar suas versoes.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Historico de Versoes</h2>
          <p className="text-sm text-muted-foreground">Versionamento completo com publicacao controlada</p>
        </div>
        <Badge variant="secondary">{versions.length} versao(oes)</Badge>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Versao</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criada em</TableHead>
                <TableHead>Publicada em</TableHead>
                <TableHead>Conteudo</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => {
                const qCount = v.content?.questions?.length ?? "?";
                const dCount = v.content?.dimensions?.length ?? "?";
                return (
                  <TableRow key={v.id} className={v.id === selectedVersionId ? "bg-muted/50" : ""}>
                    <TableCell>
                      <span className="text-lg font-bold">v{v.version}</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLE[v.status] || ""}>{v.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{shortDate(v.created_at)}</TableCell>
                    <TableCell className="text-sm">{shortDate(v.published_at)}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">{dCount} dim.</Badge>
                        <Badge variant="outline" className="text-xs">{qCount} perguntas</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {v.status === "draft" && (
                          <Button size="sm" onClick={() => onPublish(v.id)}>
                            Publicar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                        >
                          {expandedId === v.id ? "Fechar" : "Ver JSON"}
                        </Button>
                        <Button
                          variant={v.id === selectedVersionId ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSelectedVersionId(v.id)}
                        >
                          {v.id === selectedVersionId ? "Ativa" : "Selecionar"}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {versions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhuma versao para este template. Use o Builder ou JSON para criar a primeira.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* Expanded JSON preview */}
          {expandedId && (
            <div className="mt-4 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Conteudo JSON — v{versions.find((v) => v.id === expandedId)?.version}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const v = versions.find((x) => x.id === expandedId);
                    if (v) { navigator.clipboard.writeText(JSON.stringify(v.content, null, 2)); toast.success("JSON copiado"); }
                  }}
                >
                  Copiar
                </Button>
              </div>
              <pre className="text-xs font-mono overflow-auto max-h-[300px] whitespace-pre-wrap">
                {JSON.stringify(versions.find((v) => v.id === expandedId)?.content, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
