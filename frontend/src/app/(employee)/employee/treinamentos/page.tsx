"use client";

/**
 * Página de Treinamentos do Portal do Colaborador
 * 
 * Lista todos os treinamentos atribuídos ao colaborador com:
 * - Status (pendente, em andamento, concluído)
 * - Progresso
 * - Prazo
 * - Botão para iniciar/continuar/ver conteúdo
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  GraduationCap, Play, CheckCircle2, Clock, AlertTriangle, 
  RefreshCw, BookOpen, Award
} from "lucide-react";

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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-700", icon: <Clock className="h-4 w-4" /> },
  in_progress: { label: "Em Andamento", color: "bg-blue-100 text-blue-700", icon: <Play className="h-4 w-4" /> },
  completed: { label: "Concluído", color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-4 w-4" /> },
  expired: { label: "Expirado", color: "bg-red-100 text-red-700", icon: <AlertTriangle className="h-4 w-4" /> },
  excused: { label: "Dispensado", color: "bg-gray-100 text-gray-600", icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function TreinamentosPage() {
  const router = useRouter();
  const [trainings, setTrainings] = useState<MyTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");

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
    try {
      const res = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}/start`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      
      if (!res.ok) throw new Error("Erro ao iniciar treinamento");
      
      toast.success("Treinamento iniciado!");
      loadTrainings();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    }
  }

  async function handleComplete(enrollmentId: string) {
    try {
      const res = await fetch(
        `/api/bff/employee/employee/me/trainings/${enrollmentId}/complete`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      
      if (!res.ok) throw new Error("Erro ao concluir treinamento");
      
      toast.success("Treinamento concluído! 🎉");
      loadTrainings();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    }
  }

  useEffect(() => {
    loadTrainings();
  }, []);

  const filtered = trainings.filter(t => {
    if (tab === "all") return true;
    if (tab === "pending") return t.status === "pending" || t.status === "in_progress";
    if (tab === "completed") return t.status === "completed";
    if (tab === "overdue") return t.is_overdue;
    return true;
  });

  const stats = {
    total: trainings.length,
    pending: trainings.filter(t => t.status === "pending").length,
    inProgress: trainings.filter(t => t.status === "in_progress").length,
    completed: trainings.filter(t => t.status === "completed").length,
    overdue: trainings.filter(t => t.is_overdue).length,
  };

  return (
    <div className="container py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Meus Treinamentos
          </h1>
          <p className="text-muted-foreground mt-1">
            Treinamentos obrigatórios do programa de gestão de riscos
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadTrainings} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground">Em Andamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">Concluídos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
            <p className="text-xs text-muted-foreground">Atrasados</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs e Lista */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="pending">Pendentes</TabsTrigger>
          <TabsTrigger value="completed">Concluídos</TabsTrigger>
          <TabsTrigger value="overdue">Atrasados</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4">
          {loading ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Carregando treinamentos...
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <GraduationCap className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum treinamento encontrado nesta categoria.</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((training) => (
              <TrainingCard
                key={training.enrollment_id}
                training={training}
                onStart={() => handleStart(training.enrollment_id)}
                onComplete={() => handleComplete(training.enrollment_id)}
                onViewContent={() => {
                  if (training.content_id) {
                    // Abre o conteúdo em nova aba ou modal
                    router.push(`/employee/conteudos/${training.enrollment_id}`);
                  }
                }}
              />
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Link para certificados */}
      <div className="mt-8 text-center">
        <Button variant="outline" onClick={() => router.push("/employee/certificados")}>
          <Award className="h-4 w-4 mr-2" />
          Ver Meus Certificados
        </Button>
      </div>
    </div>
  );
}

function TrainingCard({ 
  training, 
  onStart, 
  onComplete, 
  onViewContent 
}: { 
  training: MyTraining;
  onStart: () => void;
  onComplete: () => void;
  onViewContent: () => void;
}) {
  const statusConfig = STATUS_CONFIG[training.status] || STATUS_CONFIG.pending;
  
  const dueText = training.due_date 
    ? new Date(training.due_date).toLocaleDateString("pt-BR")
    : null;
  
  return (
    <Card className={training.is_overdue ? "border-red-300 bg-red-50/50" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base">
              {training.content_title || training.action_item_title}
            </CardTitle>
            {training.content_description && (
              <CardDescription className="mt-1 line-clamp-2">
                {training.content_description}
              </CardDescription>
            )}
          </div>
          <Badge variant="outline" className={`${statusConfig.color} ml-2 flex items-center gap-1`}>
            {statusConfig.icon}
            {statusConfig.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Progresso */}
          {training.status === "in_progress" && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso</span>
                <span>{training.progress_percentage}%</span>
              </div>
              <Progress value={training.progress_percentage} className="h-2" />
            </div>
          )}

          {/* Info */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {training.duration_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {training.duration_minutes} min
              </span>
            )}
            {dueText && (
              <span className={`flex items-center gap-1 ${training.is_overdue ? "text-red-600 font-medium" : ""}`}>
                <AlertTriangle className={`h-3 w-3 ${training.is_overdue ? "" : "hidden"}`} />
                Prazo: {dueText}
                {training.days_until_due !== null && training.days_until_due >= 0 && (
                  <span className="text-xs">({training.days_until_due} dias)</span>
                )}
              </span>
            )}
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-2">
            {training.status === "pending" && (
              <>
                <Button size="sm" onClick={onStart}>
                  <Play className="h-4 w-4 mr-1" />
                  Iniciar
                </Button>
                {training.content_id && (
                  <Button size="sm" variant="outline" onClick={onViewContent}>
                    <BookOpen className="h-4 w-4 mr-1" />
                    Ver Conteúdo
                  </Button>
                )}
              </>
            )}
            
            {training.status === "in_progress" && (
              <>
                {training.content_id && (
                  <Button size="sm" variant="outline" onClick={onViewContent}>
                    <BookOpen className="h-4 w-4 mr-1" />
                    Continuar
                  </Button>
                )}
                <Button size="sm" onClick={onComplete}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Marcar Concluído
                </Button>
              </>
            )}
            
            {training.status === "completed" && (
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Concluído em {training.started_at ? new Date(training.started_at).toLocaleDateString("pt-BR") : ""}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
