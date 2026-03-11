"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  GraduationCap,
  Play,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Award,
  ChevronRight,
  Timer,
  CalendarDays,
  TrendingUp,
  Shield,
  Flame,
  Target,
  Sparkles,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MyTraining {
  enrollment_id: string;
  action_item_id: string;
  action_item_title: string;
  content_id: string | null;
  content_title: string | null;
  content_type: string | null;
  content_description: string | null;
  duration_minutes: number | null;
  status: string;
  progress_percentage: number;
  enrolled_at: string;
  started_at: string | null;
  due_date: string | null;
  is_overdue: boolean;
  days_until_due: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
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

function dueLabel(t: MyTraining) {
  if (!t.due_date) return null;
  if (t.is_overdue && t.days_until_due !== null)
    return `${Math.abs(t.days_until_due)}d atrasado`;
  if (t.days_until_due !== null && t.days_until_due <= 3)
    return `${t.days_until_due}d restantes`;
  return formatDate(t.due_date);
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  video: "Video",
  pdf: "Documento",
  link: "Link Externo",
  course: "Curso",
  scorm: "SCORM",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TreinamentosPage() {
  const router = useRouter();
  const [trainings, setTrainings] = useState<MyTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ---- data fetching ----
  async function loadTrainings() {
    setLoading(true);
    try {
      const res = await fetch("/api/bff/employee/employee/me/trainings", {
        credentials: "include",
      });
      if (res.status === 401) {
        router.push("/");
        return;
      }
      const data = await res.json();
      setTrainings(data);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar treinamentos");
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(enrollmentId: string) {
    setActionLoading(enrollmentId);
    try {
      const res = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}/start`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) throw new Error("Erro ao iniciar treinamento");
      toast.success("Treinamento iniciado!");
      loadTrainings();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleComplete(enrollmentId: string) {
    setActionLoading(enrollmentId);
    try {
      const res = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}/complete`,
        { method: "POST", credentials: "include" }
      );
      if (!res.ok) throw new Error("Erro ao concluir treinamento");
      toast.success("Treinamento concluido com sucesso!");
      loadTrainings();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    loadTrainings();
  }, []);

  // ---- derived ----
  const stats = useMemo(() => {
    const total = trainings.length;
    const pending = trainings.filter((t) => t.status === "pending").length;
    const inProgress = trainings.filter(
      (t) => t.status === "in_progress"
    ).length;
    const completed = trainings.filter((t) => t.status === "completed").length;
    const overdue = trainings.filter((t) => t.is_overdue).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, pending, inProgress, completed, overdue, completionRate };
  }, [trainings]);

  const filtered = useMemo(() => {
    return trainings.filter((t) => {
      if (tab === "all") return true;
      if (tab === "pending")
        return t.status === "pending" || t.status === "in_progress";
      if (tab === "completed") return t.status === "completed";
      if (tab === "overdue") return t.is_overdue;
      return true;
    });
  }, [trainings, tab]);

  // priority training: first overdue, then in_progress, then pending with nearest due
  const priorityTraining = useMemo(() => {
    const active = trainings.filter(
      (t) => t.status !== "completed" && t.status !== "cancelled"
    );
    if (active.length === 0) return null;
    const overdueOnes = active.filter((t) => t.is_overdue);
    if (overdueOnes.length > 0) return overdueOnes[0];
    const inProg = active.filter((t) => t.status === "in_progress");
    if (inProg.length > 0) return inProg[0];
    return active.sort(
      (a, b) => (a.days_until_due ?? 999) - (b.days_until_due ?? 999)
    )[0];
  }, [trainings]);

  // ---- render ----
  return (
    <div className="container py-6 md:py-8 max-w-5xl space-y-6">
      {/* ======================= HEADER ======================= */}
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10">
              <GraduationCap className="h-5 w-5 text-primary" />
            </div>
            Meus Treinamentos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Programa de Capacitacao em Gestao de Riscos - NR-1
          </p>
        </div>
        <div className="flex items-center gap-2 mt-3 md:mt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/employee/certificados")}
          >
            <Award className="h-4 w-4 mr-1.5" />
            Certificados
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadTrainings}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* ======================= PROGRESS HERO ======================= */}
      <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-primary/5 via-background to-accent/5">
        <CardContent className="p-5 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center">
            {/* left: progress ring + stats */}
            <div className="flex items-center gap-5">
              {/* circular progress */}
              <div className="relative flex-shrink-0">
                <svg className="h-20 w-20 -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-muted/30"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${stats.completionRate * 2.64} 264`}
                    className="text-primary transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold">
                    {stats.completionRate}%
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Progresso Geral
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {stats.completed}{" "}
                  <span className="text-base font-normal text-muted-foreground">
                    de {stats.total} concluidos
                  </span>
                </p>
                {stats.overdue > 0 && (
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                    <Flame className="h-3 w-3" />
                    {stats.overdue} treinamento{stats.overdue > 1 ? "s" : ""}{" "}
                    atrasado{stats.overdue > 1 ? "s" : ""}
                  </p>
                )}
                {stats.completionRate === 100 && stats.total > 0 && (
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Parabens! Todos concluidos
                  </p>
                )}
              </div>
            </div>

            {/* right: mini stats grid */}
            <div className="grid grid-cols-4 gap-3 md:gap-4">
              <MiniStat
                label="Pendentes"
                value={stats.pending}
                color="text-yellow-600"
                bg="bg-yellow-500/10"
                icon={<Clock className="h-3.5 w-3.5" />}
              />
              <MiniStat
                label="Em andamento"
                value={stats.inProgress}
                color="text-blue-600"
                bg="bg-blue-500/10"
                icon={<Play className="h-3.5 w-3.5" />}
              />
              <MiniStat
                label="Concluidos"
                value={stats.completed}
                color="text-green-600"
                bg="bg-green-500/10"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              />
              <MiniStat
                label="Atrasados"
                value={stats.overdue}
                color="text-red-600"
                bg="bg-red-500/10"
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ======================= PRIORITY BANNER ======================= */}
      {priorityTraining && priorityTraining.status !== "completed" && (
        <Card
          className={`overflow-hidden cursor-pointer transition-all hover:shadow-md ${
            priorityTraining.is_overdue
              ? "border-red-200 bg-red-50/60 dark:bg-red-950/20"
              : "border-primary/20 bg-primary/[0.03]"
          }`}
          onClick={() => {
            if (priorityTraining.content_id) {
              router.push(
                `/employee/conteudos/${priorityTraining.enrollment_id}`
              );
            }
          }}
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div
              className={`flex-shrink-0 h-11 w-11 rounded-xl flex items-center justify-center ${
                priorityTraining.is_overdue
                  ? "bg-red-100 dark:bg-red-900/30"
                  : "bg-primary/10"
              }`}
            >
              {priorityTraining.is_overdue ? (
                <Flame className="h-5 w-5 text-red-600" />
              ) : (
                <Target className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                {priorityTraining.is_overdue
                  ? "Atencao - Atrasado"
                  : "Proximo treinamento"}
              </p>
              <p className="font-semibold truncate">
                {priorityTraining.content_title ||
                  priorityTraining.action_item_title}
              </p>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                {priorityTraining.duration_minutes && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    {formatDuration(priorityTraining.duration_minutes)}
                  </span>
                )}
                {priorityTraining.due_date && (
                  <span
                    className={`flex items-center gap-1 ${
                      priorityTraining.is_overdue
                        ? "text-red-600 font-medium"
                        : ""
                    }`}
                  >
                    <CalendarDays className="h-3 w-3" />
                    {dueLabel(priorityTraining)}
                  </span>
                )}
                {priorityTraining.status === "in_progress" && (
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    {priorityTraining.progress_percentage}%
                  </span>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant={priorityTraining.is_overdue ? "destructive" : "default"}
              className="flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                if (priorityTraining.status === "pending") {
                  handleStart(priorityTraining.enrollment_id);
                } else if (priorityTraining.content_id) {
                  router.push(
                    `/employee/conteudos/${priorityTraining.enrollment_id}`
                  );
                }
              }}
              disabled={actionLoading === priorityTraining.enrollment_id}
            >
              {actionLoading === priorityTraining.enrollment_id ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : priorityTraining.status === "pending" ? (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Iniciar
                </>
              ) : (
                <>
                  <BookOpen className="h-4 w-4 mr-1" />
                  Continuar
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ======================= TABS + LIST ======================= */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full grid grid-cols-4 h-10">
          <TabsTrigger value="all" className="text-xs sm:text-sm">
            Todos
            {stats.total > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 h-5 px-1.5 text-[10px]"
              >
                {stats.total}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="text-xs sm:text-sm">
            Pendentes
            {stats.pending + stats.inProgress > 0 && (
              <Badge
                variant="secondary"
                className="ml-1.5 h-5 px-1.5 text-[10px]"
              >
                {stats.pending + stats.inProgress}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs sm:text-sm">
            Concluidos
          </TabsTrigger>
          <TabsTrigger value="overdue" className="text-xs sm:text-sm">
            Atrasados
            {stats.overdue > 0 && (
              <Badge
                variant="destructive"
                className="ml-1.5 h-5 px-1.5 text-[10px]"
              >
                {stats.overdue}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <RefreshCw className="h-8 w-8 animate-spin opacity-40" />
              <p className="text-sm">Carregando treinamentos...</p>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState tab={tab} />
          ) : (
            <div className="space-y-3">
              {filtered.map((training) => (
                <TrainingCard
                  key={training.enrollment_id}
                  training={training}
                  isActionLoading={actionLoading === training.enrollment_id}
                  onStart={() => handleStart(training.enrollment_id)}
                  onComplete={() => handleComplete(training.enrollment_id)}
                  onViewContent={() => {
                    router.push(
                      `/employee/conteudos/${training.enrollment_id}`
                    );
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ======================= NR-1 COMPLIANCE FOOTER ======================= */}
      <Card className="border-blue-200/60 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800/30">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <Shield className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Programa de Gestao de Riscos Psicossociais
            </p>
            <p className="text-xs text-blue-700/80 dark:text-blue-300/70 mt-0.5 leading-relaxed">
              Estes treinamentos fazem parte do Programa de Gerenciamento de
              Riscos conforme a NR-1 (Portaria MTE 1.419/2024). Ao concluir,
              voce recebera um certificado digital valido como evidencia de
              capacitacao.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mini Stat
// ---------------------------------------------------------------------------

function MiniStat({
  label,
  value,
  color,
  bg,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  bg: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className={`h-9 w-9 rounded-lg ${bg} flex items-center justify-center ${color}`}
      >
        {icon}
      </div>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
      <span className="text-[10px] text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ tab }: { tab: string }) {
  const messages: Record<string, { title: string; desc: string }> = {
    all: {
      title: "Nenhum treinamento atribuido",
      desc: "Voce sera notificado quando novos treinamentos estiverem disponiveis.",
    },
    pending: {
      title: "Nenhum treinamento pendente",
      desc: "Otimo! Voce nao tem treinamentos pendentes no momento.",
    },
    completed: {
      title: "Nenhum treinamento concluido ainda",
      desc: "Comece seus treinamentos para ver o progresso aqui.",
    },
    overdue: {
      title: "Nenhum treinamento atrasado",
      desc: "Excelente! Voce esta em dia com todos os prazos.",
    },
  };

  const msg = messages[tab] || messages.all;

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <GraduationCap className="h-8 w-8 text-muted-foreground/50" />
      </div>
      <p className="font-medium">{msg.title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{msg.desc}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training Card
// ---------------------------------------------------------------------------

function TrainingCard({
  training,
  isActionLoading,
  onStart,
  onComplete,
  onViewContent,
}: {
  training: MyTraining;
  isActionLoading: boolean;
  onStart: () => void;
  onComplete: () => void;
  onViewContent: () => void;
}) {
  const isCompleted = training.status === "completed";
  const isInProgress = training.status === "in_progress";
  const isPending = training.status === "pending";

  return (
    <Card
      className={`group transition-all hover:shadow-md ${
        training.is_overdue && !isCompleted
          ? "border-red-200 dark:border-red-800/40"
          : ""
      } ${isCompleted ? "opacity-80" : ""}`}
    >
      <CardContent className="p-0">
        <div className="flex items-stretch">
          {/* status stripe */}
          <div
            className={`w-1 flex-shrink-0 rounded-l-xl ${
              isCompleted
                ? "bg-green-500"
                : training.is_overdue
                ? "bg-red-500"
                : isInProgress
                ? "bg-blue-500"
                : "bg-yellow-400"
            }`}
          />

          <div className="flex-1 p-4 md:p-5">
            <div className="flex items-start gap-4">
              {/* icon */}
              <div
                className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${
                  isCompleted
                    ? "bg-green-100 dark:bg-green-900/30"
                    : training.is_overdue
                    ? "bg-red-100 dark:bg-red-900/30"
                    : isInProgress
                    ? "bg-blue-100 dark:bg-blue-900/30"
                    : "bg-yellow-100 dark:bg-yellow-900/30"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : training.is_overdue ? (
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                ) : isInProgress ? (
                  <Play className="h-5 w-5 text-blue-600" />
                ) : (
                  <Clock className="h-5 w-5 text-yellow-600" />
                )}
              </div>

              {/* content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm md:text-base leading-tight truncate">
                      {training.content_title || training.action_item_title}
                    </h3>
                    {training.content_description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {training.content_description}
                      </p>
                    )}
                  </div>

                  {/* status badge */}
                  <StatusBadge training={training} />
                </div>

                {/* meta row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-xs text-muted-foreground">
                  {training.content_type && (
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3 w-3" />
                      {CONTENT_TYPE_LABELS[training.content_type] ||
                        training.content_type}
                    </span>
                  )}
                  {training.duration_minutes && (
                    <span className="flex items-center gap-1">
                      <Timer className="h-3 w-3" />
                      {formatDuration(training.duration_minutes)}
                    </span>
                  )}
                  {training.due_date && (
                    <span
                      className={`flex items-center gap-1 ${
                        training.is_overdue && !isCompleted
                          ? "text-red-600 font-medium"
                          : ""
                      }`}
                    >
                      <CalendarDays className="h-3 w-3" />
                      {training.is_overdue && !isCompleted
                        ? `Atrasado: ${formatDate(training.due_date)}`
                        : `Prazo: ${formatDate(training.due_date)}`}
                      {training.days_until_due !== null &&
                        training.days_until_due >= 0 &&
                        !isCompleted && (
                          <span className="text-muted-foreground font-normal">
                            ({training.days_until_due}d)
                          </span>
                        )}
                    </span>
                  )}
                  {isCompleted && training.started_at && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Concluido em {formatDate(training.started_at)}
                    </span>
                  )}
                </div>

                {/* progress bar */}
                {isInProgress && (
                  <div className="mt-3 flex items-center gap-3">
                    <Progress
                      value={training.progress_percentage}
                      className="h-2 flex-1"
                    />
                    <span className="text-xs font-medium min-w-[3ch] text-right">
                      {training.progress_percentage}%
                    </span>
                  </div>
                )}

                {/* actions */}
                {!isCompleted && (
                  <div className="flex items-center gap-2 mt-3">
                    {isPending && (
                      <Button
                        size="sm"
                        onClick={onStart}
                        disabled={isActionLoading}
                        className="h-8"
                      >
                        {isActionLoading ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <Play className="h-3.5 w-3.5 mr-1" />
                        )}
                        Iniciar Treinamento
                      </Button>
                    )}
                    {isInProgress && (
                      <>
                        {training.content_id && (
                          <Button
                            size="sm"
                            onClick={onViewContent}
                            className="h-8"
                          >
                            <BookOpen className="h-3.5 w-3.5 mr-1" />
                            Continuar
                            <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={onComplete}
                          disabled={isActionLoading}
                          className="h-8"
                        >
                          {isActionLoading ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          )}
                          Concluir
                        </Button>
                      </>
                    )}
                    {isPending && training.content_id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onViewContent}
                        className="h-8 text-muted-foreground"
                      >
                        <BookOpen className="h-3.5 w-3.5 mr-1" />
                        Ver Conteudo
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ training }: { training: MyTraining }) {
  if (training.is_overdue && training.status !== "completed") {
    return (
      <Badge variant="destructive" className="flex-shrink-0 text-[10px] h-5">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Atrasado
      </Badge>
    );
  }

  const config: Record<string, { label: string; className: string }> = {
    pending: {
      label: "Pendente",
      className: "bg-yellow-100 text-yellow-700 border-yellow-200",
    },
    in_progress: {
      label: "Em Andamento",
      className: "bg-blue-100 text-blue-700 border-blue-200",
    },
    completed: {
      label: "Concluido",
      className: "bg-green-100 text-green-700 border-green-200",
    },
    expired: {
      label: "Expirado",
      className: "bg-red-100 text-red-700 border-red-200",
    },
    excused: {
      label: "Dispensado",
      className: "bg-gray-100 text-gray-600 border-gray-200",
    },
  };

  const c = config[training.status] || config.pending;

  return (
    <Badge
      variant="outline"
      className={`flex-shrink-0 text-[10px] h-5 ${c.className}`}
    >
      {c.label}
    </Badge>
  );
}
