"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

type Dimension = { key: string; name: string };
type Question = {
  id: string;
  text: string;
  dimension: string;
  weight: number;
  scale_min: number;
  scale_max: number;
};

const DEFAULT_DIMENSIONS: Dimension[] = [
  { key: "workload", name: "Carga de trabalho" },
  { key: "support", name: "Suporte e liderança" },
  { key: "autonomy", name: "Autonomia" },
  { key: "recognition", name: "Reconhecimento" },
];

const DEFAULT_QUESTIONS: Question[] = [
  {
    id: "q1",
    dimension: "workload",
    text: "Tenho tempo suficiente para cumprir minhas tarefas.",
    weight: 1,
    scale_min: 1,
    scale_max: 5,
  },
  {
    id: "q2",
    dimension: "support",
    text: "Recebo suporte adequado do meu gestor.",
    weight: 1,
    scale_min: 1,
    scale_max: 5,
  },
];

function safeKey(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "");
}

export default function QuestionariosPage() {
  const { me } = useConsole();
  const canPlatform = !!me?.is_platform_admin;

  const [templates, setTemplates] = useState<QuestionnaireTemplateDetailOut[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [versions, setVersions] = useState<QuestionnaireVersionDetailOut[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");

  // Template create
  const [key, setKey] = useState("nr1_psicossocial");
  const [name, setName] = useState("NR-1 Psicossocial");
  const [desc, setDesc] = useState("Template parametrizável para diagnóstico setorizado com agregação LGPD.");
  const [platformManaged, setPlatformManaged] = useState(false);

  // Builder
  const [title, setTitle] = useState("NR-1 – Questionário Psicossocial");
  const [dimensions, setDimensions] = useState<Dimension[]>(DEFAULT_DIMENSIONS);
  const [questions, setQuestions] = useState<Question[]>(DEFAULT_QUESTIONS);

  // Advanced JSON
  const [jsonText, setJsonText] = useState<string>("");

  const content = useMemo(() => {
    return {
      title,
      dimensions,
      questions: questions.map((q) => ({
        id: q.id,
        dimension: q.dimension,
        text: q.text,
        weight: q.weight,
        scale_min: q.scale_min,
        scale_max: q.scale_max,
      })),
    };
  }, [title, dimensions, questions]);

  useEffect(() => {
    setJsonText(JSON.stringify(content, null, 2));
  }, [content]);

  async function refreshTemplates() {
    try {
      const r = await listTemplates({ limit: 200, offset: 0 });
      setTemplates(r.items);
      if (!selectedTemplateId && r.items[0]?.id) setSelectedTemplateId(r.items[0].id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar templates");
    }
  }

  async function refreshVersions(templateId: string) {
    try {
      const r = await listVersions(templateId, { limit: 200, offset: 0 });
      setVersions(r.items);
      const published = r.items.find((x) => x.status === "published");
      if (!selectedVersionId && published?.id) setSelectedVersionId(published.id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar versões");
    }
  }

  useEffect(() => {
    refreshTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedTemplateId) refreshVersions(selectedTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);

  const templateOptions = useMemo(
    () => templates.map((t) => ({ id: t.id, label: `${t.name} (${t.key})${t.is_platform_managed ? " • oficial" : ""}` })),
    [templates]
  );
  const versionOptions = useMemo(
    () => versions.map((v) => ({ id: v.id, label: `v${v.version} • ${v.status}${v.published_at ? " • publicado" : ""}` })),
    [versions]
  );

  async function onCreateTemplate() {
    try {
      const r = await createTemplate({
        key: safeKey(key),
        name,
        description: desc,
        is_platform_managed: canPlatform ? platformManaged : false,
      });
      toast.success("Template criado");
      await refreshTemplates();
      setSelectedTemplateId(r.id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar template");
    }
  }

  async function onCreateVersionFromBuilder() {
    try {
      if (!selectedTemplateId) throw new Error("Selecione um template");
      if (questions.length === 0) throw new Error("Adicione ao menos uma pergunta");
      // validações mínimas (enterprise): ids únicos e dimensões existentes
      const ids = new Set<string>();
      for (const q of questions) {
        if (!q.id) throw new Error("Toda pergunta precisa de um ID");
        if (ids.has(q.id)) throw new Error(`ID duplicado: ${q.id}`);
        ids.add(q.id);
        if (!q.dimension) throw new Error(`Pergunta ${q.id} sem dimensão`);
        if (!dimensions.some((d) => d.key === q.dimension)) throw new Error(`Dimensão inexistente: ${q.dimension}`);
      }
      const r = await createVersion(selectedTemplateId, { content });
      toast.success("Versão criada (draft)");
      await refreshVersions(selectedTemplateId);
      setSelectedVersionId(r.id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar versão");
    }
  }

  async function onCreateVersionFromJson() {
    try {
      if (!selectedTemplateId) throw new Error("Selecione um template");
      const parsed = JSON.parse(jsonText);
      const r = await createVersion(selectedTemplateId, { content: parsed });
      toast.success("Versão criada (draft)");
      await refreshVersions(selectedTemplateId);
      setSelectedVersionId(r.id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar versão (JSON)");
    }
  }

  async function onPublish() {
    try {
      if (!selectedVersionId) throw new Error("Selecione uma versão");
      const r = await publishVersion(selectedVersionId);
      toast.success("Versão publicada");
      if (selectedTemplateId) await refreshVersions(selectedTemplateId);
      setSelectedVersionId(r.id);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao publicar");
    }
  }

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Questionários"
        description="Builder enterprise (sem JSON obrigatório): dimensões, perguntas, versionamento e publicação."
      />

      <Card>
        <CardHeader>
          <CardTitle>Selecionar</CardTitle>
          <CardDescription>Escolha o template e a versão para operar. Apenas versões publicadas podem ser usadas em campanhas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Template</Label>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              <option value="">Selecione</option>
              {templateOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={refreshTemplates}>
              Atualizar lista
            </Button>
          </div>

          <div className="grid gap-2">
            <Label>Versão</Label>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={selectedVersionId}
              onChange={(e) => setSelectedVersionId(e.target.value)}
            >
              <option value="">Selecione</option>
              {versionOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">Dica: publique a versão para liberar o uso em campanhas.</div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="builder">
        <TabsList>
          <TabsTrigger value="builder">Builder</TabsTrigger>
          <TabsTrigger value="json">Avançado (JSON)</TabsTrigger>
          <TabsTrigger value="template">Criar template</TabsTrigger>
          <TabsTrigger value="publish">Publicar</TabsTrigger>
        </TabsList>

        <TabsContent value="builder">
          <Card>
            <CardHeader>
              <CardTitle>Builder (recomendado)</CardTitle>
              <CardDescription>
                Modele dimensões e perguntas de forma guiada. O motor de risco usa <Badge variant="secondary">questions[].dimension/weight/scale_min/scale_max</Badge>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2 md:col-span-2">
                  <Label>Título</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>Dimensões</Label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setDimensions((prev) => [...prev, { key: `dim_${prev.length + 1}`, name: "Nova dimensão" }])
                      }
                    >
                      Adicionar dimensão
                    </Button>
                  </div>
                  <div className="grid gap-3">
                    {dimensions.map((d, idx) => (
                      <div key={`${d.key}_${idx}`} className="rounded-lg border p-3 grid gap-2 md:grid-cols-3">
                        <div className="grid gap-1">
                          <div className="text-xs text-muted-foreground">Key</div>
                          <Input
                            value={d.key}
                            onChange={(e) =>
                              setDimensions((prev) => prev.map((x, i) => (i === idx ? { ...x, key: safeKey(e.target.value) } : x)))
                            }
                          />
                        </div>
                        <div className="grid gap-1 md:col-span-2">
                          <div className="text-xs text-muted-foreground">Nome</div>
                          <Input
                            value={d.name}
                            onChange={(e) => setDimensions((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                          />
                        </div>
                        <div className="md:col-span-3 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              const key = d.key;
                              setDimensions((prev) => prev.filter((_, i) => i !== idx));
                              // remove perguntas dessa dimensão
                              setQuestions((prev) => prev.map((q) => (q.dimension === key ? { ...q, dimension: "" } : q)));
                            }}
                          >
                            Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>Perguntas</Label>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() =>
                        setQuestions((prev) => [
                          ...prev,
                          {
                            id: `q${prev.length + 1}`,
                            dimension: dimensions[0]?.key || "general",
                            text: "Nova pergunta",
                            weight: 1,
                            scale_min: 1,
                            scale_max: 5,
                          },
                        ])
                      }
                    >
                      Adicionar pergunta
                    </Button>
                  </div>

                  <div className="grid gap-3">
                    {questions.map((q, idx) => (
                      <div key={`${q.id}_${idx}`} className="rounded-lg border p-3 grid gap-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="grid gap-1">
                            <div className="text-xs text-muted-foreground">ID</div>
                            <Input value={q.id} onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, id: safeKey(e.target.value) || x.id } : x)))} />
                          </div>
                          <div className="grid gap-1 md:col-span-2">
                            <div className="text-xs text-muted-foreground">Dimensão</div>
                            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={q.dimension} onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, dimension: e.target.value } : x)))}>
                              <option value="">Selecione</option>
                              {dimensions.map((d) => (
                                <option key={d.key} value={d.key}>
                                  {d.name} ({d.key})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="grid gap-1">
                          <div className="text-xs text-muted-foreground">Texto</div>
                          <Textarea value={q.text} onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)))} />
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="grid gap-1">
                            <div className="text-xs text-muted-foreground">Peso</div>
                            <Input type="number" value={q.weight} onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, weight: Number(e.target.value) || 1 } : x)))} />
                          </div>
                          <div className="grid gap-1">
                            <div className="text-xs text-muted-foreground">Escala min</div>
                            <Input type="number" value={q.scale_min} onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, scale_min: Number(e.target.value) || 1 } : x)))} />
                          </div>
                          <div className="grid gap-1">
                            <div className="text-xs text-muted-foreground">Escala max</div>
                            <Input type="number" value={q.scale_max} onChange={(e) => setQuestions((prev) => prev.map((x, i) => (i === idx ? { ...x, scale_max: Number(e.target.value) || 5 } : x)))} />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button type="button" variant="outline" onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== idx))}>
                            Remover
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={onCreateVersionFromBuilder} disabled={!selectedTemplateId}>
                  Criar versão (draft)
                </Button>
                <Button variant="secondary" onClick={() => navigator.clipboard.writeText(jsonText)}>
                  Copiar JSON
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="json">
          <Card>
            <CardHeader>
              <CardTitle>Avançado (JSON)</CardTitle>
              <CardDescription>
                Para equipes com governança técnica. Você pode ajustar manualmente o conteúdo antes de criar uma versão.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Conteúdo JSON</Label>
                <Textarea className="font-mono text-xs min-h-[320px]" value={jsonText} onChange={(e) => setJsonText(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={onCreateVersionFromJson} disabled={!selectedTemplateId}>Criar versão (draft)</Button>
                <Button variant="secondary" onClick={() => setJsonText(JSON.stringify(content, null, 2))}>Regerar do Builder</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="template">
          <Card>
            <CardHeader>
              <CardTitle>Novo template</CardTitle>
              <CardDescription>Para modelos oficiais, somente Admin da Plataforma (PLA).</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label>Key</Label>
                <Input value={key} onChange={(e) => setKey(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label>Nome</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label>Descrição</Label>
                <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
              </div>

              {canPlatform ? (
                <div className="flex items-center gap-2 md:col-span-2">
                  <input type="checkbox" checked={platformManaged} onChange={(e) => setPlatformManaged(e.target.checked)} />
                  <Label>Template oficial (platform managed)</Label>
                </div>
              ) : null}

              <div className="md:col-span-2">
                <Button onClick={onCreateTemplate}>Criar</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="publish">
          <Card>
            <CardHeader>
              <CardTitle>Publicar versão</CardTitle>
              <CardDescription>Somente versões publicadas podem ser usadas em campanhas.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Dica: crie a versão em draft (via Builder/JSON), selecione-a acima em <strong>Versão</strong> e publique.
              </div>
              <div className="flex gap-2">
                <Button onClick={onPublish} disabled={!selectedVersionId}>Publicar selecionada</Button>
                <Button variant="secondary" onClick={() => selectedTemplateId && refreshVersions(selectedTemplateId)} disabled={!selectedTemplateId}>Atualizar versões</Button>
              </div>
              {selectedVersionId ? (
                <div className="rounded-lg border bg-muted/20 p-4 text-xs text-muted-foreground">
                  <div><span className="font-medium text-foreground">Versão selecionada:</span> {selectedVersionId}</div>
                  <div className="mt-1">Use esse ID ao criar campanhas (wizard de campanhas seleciona automaticamente versões publicadas).</div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
