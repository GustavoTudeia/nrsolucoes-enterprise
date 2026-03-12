"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Play,
  ExternalLink,
  FileText,
  Video,
  Link as LinkIcon,
  RefreshCw,
  Clock,
  CalendarDays,
  Award,
  Download,
  Maximize2,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Shield,
  AlertTriangle,
  Globe,
  Loader2,
  Volume2,
  Pause,
  SkipForward,
  Layers,
  CircleDot,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrainingContent {
  content_id: string;
  content_type: string;
  title: string;
  access_url: string;
  expires_in_seconds: number;
  order_index?: number;
}

interface TrainingDetail {
  enrollment_id: string;
  training_title: string;
  training_description: string | null;
  training_type: string;
  duration_minutes: number | null;
  status: string;
  progress_percent: number;
  due_date: string | null;
  is_overdue: boolean;
  started_at: string | null;
  completed_at: string | null;
  content_id: string | null;
  has_certificate: boolean;
  certificate_id: string | null;
  // Learning path fields
  is_learning_path: boolean;
  learning_path_id: string | null;
  learning_path_title: string | null;
  learning_path_item_count: number;
  learning_path_completed_count: number;
}

interface LearningPathItem {
  order_index: number;
  content_item_id: string;
  title: string;
  description: string | null;
  content_type: string | null;
  duration_minutes: number | null;
  is_completed: boolean;
  completed_at: string | null;
}

interface LearningPathDetail {
  learning_path_id: string;
  title: string;
  description: string | null;
  total_items: number;
  completed_items: number;
  items: LearningPathItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDuration(minutes: number) {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
  }
  return `${minutes} min`;
}

function formatSeconds(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const STATUS_CONFIG: Record<string, { label: string; class: string }> = {
  pending: { label: "Pendente", class: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800" },
  in_progress: { label: "Em Andamento", class: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800" },
  completed: { label: "Concluido", class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800" },
  expired: { label: "Expirado", class: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800" },
};

const CONTENT_LABELS: Record<string, { label: string; icon: typeof Video }> = {
  video: { label: "Video", icon: Video },
  pdf: { label: "Documento PDF", icon: FileText },
  link: { label: "Link Externo", icon: Globe },
  course: { label: "Curso", icon: BookOpen },
  scorm: { label: "SCORM", icon: BookOpen },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ConteudoPage() {
  const params = useParams();
  const router = useRouter();
  const enrollmentId = String(params.assignmentId);

  const [training, setTraining] = useState<TrainingDetail | null>(null);
  const [content, setContent] = useState<TrainingContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [starting, setStarting] = useState(false);

  // Learning path state
  const [pathDetail, setPathDetail] = useState<LearningPathDetail | null>(null);
  const [currentItemIndex, setCurrentItemIndex] = useState<number>(0);
  const [itemCompleting, setItemCompleting] = useState(false);

  // ---- data fetching ----
  async function loadData() {
    setLoading(true);
    try {
      const trainingRes = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}`,
        { credentials: "include" }
      );

      if (!trainingRes.ok) {
        if (trainingRes.status === 401) { router.push("/"); return; }
        throw new Error("Treinamento nao encontrado");
      }

      const trainingData: TrainingDetail = await trainingRes.json();
      setTraining(trainingData);

      if (trainingData.is_learning_path) {
        // Load learning path structure
        const pathRes = await fetch(
          `/api/bff/employee/employee/me/trainings/${enrollmentId}/learning-path`,
          { credentials: "include" }
        );
        if (pathRes.ok) {
          const pathData: LearningPathDetail = await pathRes.json();
          setPathDetail(pathData);
          // Auto-select first incomplete item, or first item
          const firstIncomplete = pathData.items.findIndex((i) => !i.is_completed);
          const startIdx = firstIncomplete >= 0 ? firstIncomplete : 0;
          setCurrentItemIndex(startIdx);
          // Load content for that item
          await loadPathItemContent(startIdx);
        }
      } else if (trainingData.content_id) {
        const contentRes = await fetch(
          `/api/bff/employee/employee/me/trainings/${enrollmentId}/content`,
          { credentials: "include" }
        );
        if (contentRes.ok) {
          setContent(await contentRes.json());
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar conteudo");
    } finally {
      setLoading(false);
    }
  }

  async function loadPathItemContent(itemIndex: number) {
    try {
      const res = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}/learning-path/${itemIndex}/content`,
        { credentials: "include" }
      );
      if (res.ok) {
        setContent(await res.json());
      } else {
        setContent(null);
      }
    } catch {
      setContent(null);
    }
  }

  async function navigateToItem(itemIndex: number) {
    setCurrentItemIndex(itemIndex);
    setContent(null);
    await loadPathItemContent(itemIndex);
  }

  async function handleCompleteItem() {
    setItemCompleting(true);
    try {
      const res = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}/learning-path/${currentItemIndex}/complete`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) throw new Error("Erro ao concluir item");
      const data = await res.json();

      // Update path detail locally
      if (pathDetail) {
        const updatedItems = pathDetail.items.map((item, i) =>
          i === currentItemIndex ? { ...item, is_completed: true, completed_at: new Date().toISOString() } : item
        );
        setPathDetail({
          ...pathDetail,
          items: updatedItems,
          completed_items: data.completed_items,
        });
      }

      if (data.all_completed) {
        toast.success("Trilha concluida com sucesso!");
        if (data.certificate_id) {
          toast.success("Certificado digital gerado automaticamente!");
        }
        // Refresh training status
        const trainingRes = await fetch(
          `/api/bff/employee/employee/me/trainings/${enrollmentId}`,
          { credentials: "include" }
        );
        if (trainingRes.ok) setTraining(await trainingRes.json());
      } else {
        toast.success(`Item concluido (${data.completed_items}/${data.total_items})`);
        // Auto-navigate to next incomplete item
        if (pathDetail) {
          const nextIncomplete = pathDetail.items.findIndex(
            (item, idx) => idx > currentItemIndex && !item.is_completed
          );
          if (nextIncomplete >= 0) {
            await navigateToItem(nextIncomplete);
          }
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setItemCompleting(false);
    }
  }

  async function handleStart() {
    setStarting(true);
    try {
      const res = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}/start`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) throw new Error("Erro ao iniciar");
      toast.success("Treinamento iniciado!");
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setStarting(false);
    }
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      const res = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}/complete`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) throw new Error("Erro ao concluir");
      const data = await res.json();
      toast.success("Treinamento concluido com sucesso!");
      if (data.certificate_id) {
        toast.success("Certificado digital gerado automaticamente!");
      }
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setCompleting(false);
    }
  }

  useEffect(() => { loadData(); }, [enrollmentId]);

  // ---- render states ----
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Carregando conteudo...</p>
        </div>
      </div>
    );
  }

  if (!training) {
    return (
      <div className="container py-8 max-w-4xl">
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <AlertTriangle className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">Treinamento nao encontrado.</p>
            <Button variant="outline" onClick={() => router.push("/employee/treinamentos")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar para Treinamentos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCompleted = training.status === "completed";
  const isInProgress = training.status === "in_progress";
  const isPending = training.status === "pending";
  const isLP = training.is_learning_path;
  const statusCfg = STATUS_CONFIG[training.status] || STATUS_CONFIG.pending;
  const contentCfg = content ? (CONTENT_LABELS[content.content_type] || CONTENT_LABELS.link) : null;
  const currentItem = pathDetail?.items[currentItemIndex];
  const currentItemCompleted = currentItem?.is_completed ?? false;

  return (
    <div className="container py-6 md:py-8 max-w-6xl space-y-6">
      {/* ======================= BREADCRUMB + HEADER ======================= */}
      <div>
        <button
          onClick={() => router.push("/employee/treinamentos")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Meus Treinamentos
        </button>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <Badge variant="outline" className={statusCfg.class}>
                {statusCfg.label}
              </Badge>
              {isLP && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Layers className="h-3 w-3" />
                  Trilha de Aprendizagem
                </Badge>
              )}
              {contentCfg && !isLP && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <contentCfg.icon className="h-3 w-3" />
                  {contentCfg.label}
                </Badge>
              )}
              {training.is_overdue && !isCompleted && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Atrasado
                </Badge>
              )}
            </div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight">
              {training.training_title}
            </h1>
            {training.training_description && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed max-w-2xl">
                {training.training_description}
              </p>
            )}
          </div>

          {/* Action buttons (top-right on desktop) */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isPending && !isLP && (
              <Button onClick={handleStart} disabled={starting}>
                {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Iniciar Treinamento
              </Button>
            )}
            {isInProgress && !isLP && (
              <Button onClick={handleComplete} disabled={completing} variant="default">
                {completing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Concluir Treinamento
              </Button>
            )}
            {isCompleted && training.has_certificate && (
              <Button variant="outline" onClick={() => router.push("/employee/certificados")}>
                <Award className="h-4 w-4 mr-2" />
                Ver Certificado
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ======================= LEARNING PATH PROGRESS BAR ======================= */}
      {isLP && pathDetail && (
        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <Layers className="h-4 w-4 text-primary" />
                <span className="font-medium">{pathDetail.title}</span>
              </div>
              <div className="flex-1 flex items-center gap-3">
                <Progress
                  value={pathDetail.total_items > 0 ? (pathDetail.completed_items / pathDetail.total_items) * 100 : 0}
                  className="h-2 flex-1"
                />
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {pathDetail.completed_items} de {pathDetail.total_items} concluidos
                </span>
              </div>
              {training.due_date && (
                <span className={`text-xs flex items-center gap-1 ${training.is_overdue && !isCompleted ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(training.due_date)}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ======================= META INFO BAR (non-LP) ======================= */}
      {!isLP && (
        <Card className="border-0 shadow-sm bg-muted/30">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              {training.duration_minutes != null && training.duration_minutes > 0 && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  {formatDuration(training.duration_minutes)}
                </span>
              )}
              {training.due_date && (
                <span className={`flex items-center gap-1.5 ${training.is_overdue && !isCompleted ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                  <CalendarDays className="h-4 w-4" />
                  Prazo: {formatDate(training.due_date)}
                </span>
              )}
              {training.started_at && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Play className="h-4 w-4" />
                  Iniciado em {formatDate(training.started_at)}
                </span>
              )}
              {training.completed_at && (
                <span className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Concluido em {formatDate(training.completed_at)}
                </span>
              )}
              {!isCompleted && (
                <span className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-muted-foreground">{training.progress_percent}%</span>
                  <Progress value={training.progress_percent} className="h-1.5 w-24" />
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ======================= LEARNING PATH LAYOUT ======================= */}
      {isLP && pathDetail ? (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          {/* ---- Stepper Sidebar ---- */}
          <Card className="h-fit lg:sticky lg:top-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Itens da Trilha</h3>
              </div>
              <div className="space-y-1">
                {pathDetail.items.map((item, idx) => {
                  const isCurrent = idx === currentItemIndex;
                  const ItemIcon = CONTENT_LABELS[item.content_type || "link"]?.icon || BookOpen;
                  return (
                    <button
                      key={item.content_item_id}
                      onClick={() => navigateToItem(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        isCurrent
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      {/* Step number / check */}
                      <div className={`flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        item.is_completed
                          ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                          : isCurrent
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {item.is_completed ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium truncate ${
                          item.is_completed ? "text-muted-foreground" : isCurrent ? "text-foreground" : "text-muted-foreground"
                        }`}>
                          {item.title}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ItemIcon className="h-3 w-3 text-muted-foreground/60" />
                          {item.duration_minutes != null && item.duration_minutes > 0 && (
                            <span className="text-[10px] text-muted-foreground/60">
                              {formatDuration(item.duration_minutes)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* ---- Content Area ---- */}
          <div className="space-y-4">
            {/* Current item header */}
            {currentItem && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-xs">
                    {currentItemIndex + 1} de {pathDetail.total_items}
                  </Badge>
                  <h2 className="text-lg font-semibold">{currentItem.title}</h2>
                </div>
                {!currentItemCompleted && !isCompleted && (
                  <Button
                    size="sm"
                    onClick={handleCompleteItem}
                    disabled={itemCompleting}
                  >
                    {itemCompleting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Concluir Item
                  </Button>
                )}
                {currentItemCompleted && (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800 gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Concluido
                  </Badge>
                )}
              </div>
            )}

            {/* Content renderer */}
            {content ? (
              <ContentRenderer
                content={content}
                training={training}
                enrollmentId={enrollmentId}
                onAutoComplete={!currentItemCompleted && !isCompleted ? handleCompleteItem : undefined}
              />
            ) : (
              <Card>
                <CardContent className="py-12 text-center space-y-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
                  <p className="text-sm text-muted-foreground">Carregando conteudo...</p>
                </CardContent>
              </Card>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateToItem(currentItemIndex - 1)}
                disabled={currentItemIndex === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <div className="text-xs text-muted-foreground">
                Item {currentItemIndex + 1} de {pathDetail.total_items}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateToItem(currentItemIndex + 1)}
                disabled={currentItemIndex >= pathDetail.total_items - 1}
              >
                Proximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* ======================= REGULAR CONTENT AREA ======================= */
        <>
          {content ? (
            <ContentRenderer
              content={content}
              training={training}
              enrollmentId={enrollmentId}
              onAutoComplete={!isCompleted && isInProgress ? handleComplete : undefined}
            />
          ) : (
            <Card>
              <CardContent className="py-16 text-center space-y-4">
                <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                  <FileText className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="font-medium">Conteudo nao vinculado</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Este treinamento nao possui conteudo digital. Realize a atividade presencial e marque como concluido.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ======================= COMPLETED STATE ======================= */}
      {isCompleted && (
        <Card className="border-green-200/60 bg-green-50/50 dark:bg-green-950/20 dark:border-green-800/30 overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-green-900 dark:text-green-100">
                  {isLP ? "Trilha Concluida" : "Treinamento Concluido"}
                </p>
                {training.completed_at && (
                  <p className="text-sm text-green-700/80 dark:text-green-300/70 mt-1">
                    Concluido em {formatDate(training.completed_at)}
                  </p>
                )}
                {training.has_certificate && (
                  <div className="mt-3 flex items-center gap-2">
                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400 gap-1">
                      <Award className="h-3 w-3" />
                      Certificado disponivel
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => router.push("/employee/certificados")} className="h-7 text-xs">
                      Acessar
                      <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ======================= NR-1 FOOTER ======================= */}
      <Card className="border-blue-200/60 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800/30">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Shield className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Conformidade NR-1
            </p>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/70 mt-0.5 leading-relaxed">
              Este treinamento faz parte do Programa de Gerenciamento de Riscos (PGR). Ao concluir, um certificado
              digital sera emitido como evidencia de capacitacao conforme a NR-1 (Portaria MTE 1.419/2024).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content Renderer
// ---------------------------------------------------------------------------

function urlHasExtension(url: string, ext: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return pathname.toLowerCase().endsWith(ext);
  } catch {
    return url?.endsWith(ext) ?? false;
  }
}

function ContentRenderer({
  content,
  training,
  enrollmentId,
  onAutoComplete,
}: {
  content: TrainingContent;
  training: TrainingDetail;
  enrollmentId: string;
  onAutoComplete?: () => void;
}) {
  const isYouTube =
    content.access_url?.includes("youtube.com") ||
    content.access_url?.includes("youtu.be");
  const isPdf =
    content.content_type === "pdf" || urlHasExtension(content.access_url, ".pdf");
  const isVideo =
    (content.content_type === "video" || isYouTube) && !isPdf;

  if (isYouTube) return <YouTubePlayer content={content} />;
  if (isPdf) return <PdfViewer content={content} />;
  if (isVideo) return <VideoPlayer content={content} enrollmentId={enrollmentId} onAutoComplete={onAutoComplete} />;
  return <LinkViewer content={content} />;
}

// ---------------------------------------------------------------------------
// YouTube Player
// ---------------------------------------------------------------------------

function YouTubePlayer({ content }: { content: TrainingContent }) {
  let embedUrl = content.access_url;
  try {
    const url = new URL(content.access_url);
    if (url.hostname.includes("youtube.com") && url.searchParams.get("v")) {
      embedUrl = `https://www.youtube.com/embed/${url.searchParams.get("v")}?rel=0&modestbranding=1`;
    } else if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      embedUrl = `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
    }
  } catch {}

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <div className="bg-black">
        <div className="aspect-video w-full">
          <iframe
            className="h-full w-full"
            src={embedUrl}
            title={content.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      </div>
      <CardContent className="p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium">{content.title}</span>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <a href={content.access_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Abrir no YouTube
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Video Player (for uploaded files: .mp4, .mov, .webm, etc.)
// ---------------------------------------------------------------------------

function VideoPlayer({
  content,
  enrollmentId,
  onAutoComplete,
}: {
  content: TrainingContent;
  enrollmentId: string;
  onAutoComplete?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showOverlay, setShowOverlay] = useState(true);
  const progressSentRef = useRef(0);
  const autoCompletedRef = useRef(false);

  const sendProgress = useCallback(
    async (position: number) => {
      // Throttle: only send every 15 seconds of new watch time
      if (position - progressSentRef.current < 15) return;
      progressSentRef.current = position;
      try {
        await fetch(
          `/api/bff/employee/employee/me/trainings/${enrollmentId}/progress`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              position_seconds: Math.floor(position),
              duration_seconds: Math.floor(duration),
            }),
          }
        );
      } catch {
        // Silent fail for progress tracking
      }
    },
    [enrollmentId, duration]
  );

  function handleTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
    sendProgress(v.currentTime);

    // Auto-complete at 95% watch threshold
    if (
      !autoCompletedRef.current &&
      onAutoComplete &&
      v.duration > 0 &&
      v.currentTime / v.duration >= 0.95
    ) {
      autoCompletedRef.current = true;
      onAutoComplete();
    }
  }

  function handleLoadedMetadata() {
    const v = videoRef.current;
    if (v) setDuration(v.duration);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
      setShowOverlay(false);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }

  function handleEnded() {
    setIsPlaying(false);
    setShowOverlay(true);
    sendProgress(duration);
  }

  function toggleFullscreen() {
    const v = videoRef.current;
    if (!v) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      v.requestFullscreen?.();
    }
  }

  function skip(seconds: number) {
    const v = videoRef.current;
    if (v) v.currentTime = Math.min(Math.max(v.currentTime + seconds, 0), duration);
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      {/* Video container */}
      <div className="relative bg-black group">
        <video
          ref={videoRef}
          className="w-full aspect-video cursor-pointer"
          src={content.access_url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onPlay={() => { setIsPlaying(true); setShowOverlay(false); }}
          onPause={() => setIsPlaying(false)}
          onEnded={handleEnded}
          onClick={togglePlay}
          playsInline
          preload="metadata"
        />

        {/* Play overlay (initial / ended) */}
        {showOverlay && !isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer" onClick={togglePlay}>
            <div className="h-16 w-16 rounded-full bg-primary/90 flex items-center justify-center shadow-xl hover:bg-primary transition-colors">
              <Play className="h-7 w-7 text-white ml-1" fill="white" />
            </div>
          </div>
        )}

        {/* Bottom controls bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-3 px-4 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Progress bar */}
          <div
            className="w-full h-1 bg-white/30 rounded-full mb-3 cursor-pointer group/bar"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              if (videoRef.current) videoRef.current.currentTime = pct * duration;
            }}
          >
            <div
              className="h-full bg-primary rounded-full relative transition-all"
              style={{ width: `${progressPct}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white shadow opacity-0 group-hover/bar:opacity-100 transition-opacity" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={togglePlay} className="text-white hover:text-primary transition-colors">
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </button>
              <button onClick={() => skip(10)} className="text-white/70 hover:text-white transition-colors">
                <SkipForward className="h-4 w-4" />
              </button>
              <span className="text-xs text-white/70 font-mono tabular-nums">
                {formatSeconds(currentTime)} / {formatSeconds(duration)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleFullscreen} className="text-white/70 hover:text-white transition-colors">
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Video info footer */}
      <CardContent className="p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{content.title}</span>
            {duration > 0 && (
              <span className="text-xs text-muted-foreground">
                ({formatSeconds(duration)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={content.access_url} download className="text-muted-foreground">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </a>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// PDF Viewer
// ---------------------------------------------------------------------------

function PdfViewer({ content }: { content: TrainingContent }) {
  const [pdfLoaded, setPdfLoaded] = useState(false);

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium">{content.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <a href={content.access_url} download className="text-muted-foreground">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={content.access_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Nova aba
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={content.access_url} target="_blank" rel="noopener noreferrer">
              <Maximize2 className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>

      {/* PDF embed */}
      <div className="relative bg-muted/20">
        {!pdfLoaded && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center space-y-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
              <p className="text-xs text-muted-foreground">Carregando documento...</p>
            </div>
          </div>
        )}
        <iframe
          className="w-full border-0"
          style={{ height: "70vh", minHeight: "500px" }}
          src={content.access_url}
          title={content.title}
          onLoad={() => setPdfLoaded(true)}
        />
      </div>

      {/* Footer tip */}
      <CardContent className="p-3 bg-muted/30 border-t">
        <p className="text-xs text-muted-foreground text-center">
          Caso o documento nao carregue, utilize o botao "Nova aba" acima para visualizar externamente.
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Link Viewer
// ---------------------------------------------------------------------------

function LinkViewer({ content }: { content: TrainingContent }) {
  let hostname = "";
  try {
    hostname = new URL(content.access_url).hostname;
  } catch {}

  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <CardContent className="p-0">
        <div className="grid md:grid-cols-[1fr_auto] items-stretch">
          {/* Left: Info */}
          <div className="p-6 md:p-8 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Conteudo Externo</p>
                {hostname && (
                  <p className="text-xs text-muted-foreground">{hostname}</p>
                )}
              </div>
            </div>
            <h3 className="text-lg font-semibold mb-2">{content.title}</h3>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Este conteudo esta hospedado em uma plataforma externa. Clique no botao abaixo para acessar
              em uma nova aba. Ao finalizar, volte aqui para marcar como concluido.
            </p>
            <div className="flex items-center gap-3">
              <Button asChild size="lg">
                <a href={content.access_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Acessar Conteudo
                </a>
              </Button>
              <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                <a href={content.access_url} target="_blank" rel="noopener noreferrer">
                  Copiar link
                </a>
              </Button>
            </div>
          </div>

          {/* Right: Visual accent */}
          <div className="hidden md:flex w-48 bg-gradient-to-br from-primary/5 to-primary/15 items-center justify-center border-l">
            <div className="text-center space-y-3">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <ExternalLink className="h-8 w-8 text-primary/60" />
              </div>
              <p className="text-xs text-muted-foreground px-4">
                Abre em nova aba
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
