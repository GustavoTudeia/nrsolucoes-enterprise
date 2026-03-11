"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  ArrowLeft, CheckCircle2, Play, ExternalLink, FileText,
  Video, Link as LinkIcon, RefreshCw
} from "lucide-react";

interface TrainingContent {
  content_id: string;
  content_type: string;
  title: string;
  access_url: string;
  expires_in_seconds: number;
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
}

export default function ConteudoPage() {
  const params = useParams();
  const router = useRouter();
  const enrollmentId = String(params.assignmentId);

  const [training, setTraining] = useState<TrainingDetail | null>(null);
  const [content, setContent] = useState<TrainingContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);

  async function loadData() {
    setLoading(true);
    try {
      // Buscar detalhes do treinamento
      const trainingRes = await fetch(`/api/bff/employee/employee/me/trainings/${enrollmentId}`, {
        credentials: "include",
      });

      if (!trainingRes.ok) {
        if (trainingRes.status === 401) {
          router.push("/");
          return;
        }
        throw new Error("Treinamento não encontrado");
      }

      const trainingData = await trainingRes.json();
      setTraining(trainingData);

      // Buscar conteúdo se existir
      if (trainingData.content_id) {
        const contentRes = await fetch(`/api/bff/employee/employee/me/trainings/${enrollmentId}/content`, {
          credentials: "include",
        });

        if (contentRes.ok) {
          const contentData = await contentRes.json();
          setContent(contentData);
        }
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar conteúdo");
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    try {
      const res = await fetch(`/api/bff/employee/employee/me/trainings/${enrollmentId}/start`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Erro ao iniciar");

      toast.success("Treinamento iniciado!");
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    }
  }

  async function handleComplete() {
    setCompleting(true);
    try {
      const res = await fetch(`/api/bff/employee/employee/me/trainings/${enrollmentId}/complete`, {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Erro ao concluir");

      const data = await res.json();
      toast.success("Treinamento concluído! 🎉");
      
      if (data.certificate_id) {
        toast.success("Certificado gerado!");
      }

      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setCompleting(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [enrollmentId]);

  function getContentIcon(type: string) {
    switch (type) {
      case "video": return <Video className="h-5 w-5" />;
      case "pdf": return <FileText className="h-5 w-5" />;
      case "link": return <LinkIcon className="h-5 w-5" />;
      default: return <FileText className="h-5 w-5" />;
    }
  }

  function renderContent() {
    if (!content) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Este treinamento não possui conteúdo vinculado.</p>
          <p className="text-sm mt-2">Você pode marcar como concluído após realizar a atividade.</p>
        </div>
      );
    }

    const isYouTube = content.access_url?.includes("youtube.com") || content.access_url?.includes("youtu.be");
    const isVideo = content.content_type === "video" || isYouTube;
    const isPdf = content.content_type === "pdf" || content.access_url?.endsWith(".pdf");

    if (isYouTube) {
      let embedUrl = content.access_url;
      try {
        const url = new URL(content.access_url);
        if (url.hostname.includes("youtube.com") && url.searchParams.get("v")) {
          embedUrl = `https://www.youtube.com/embed/${url.searchParams.get("v")}`;
        } else if (url.hostname.includes("youtu.be")) {
          const id = url.pathname.replace("/", "");
          embedUrl = `https://www.youtube.com/embed/${id}`;
        }
      } catch {}

      return (
        <div className="aspect-video w-full overflow-hidden rounded-lg border">
          <iframe
            className="h-full w-full"
            src={embedUrl}
            title={content.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }

    if (isVideo) {
      return (
        <video
          className="w-full rounded-lg border"
          controls
          src={content.access_url}
        />
      );
    }

    if (isPdf) {
      return (
        <div className="space-y-4">
          <iframe
            className="w-full h-[600px] rounded-lg border"
            src={content.access_url}
            title={content.title}
          />
          <Button variant="outline" asChild>
            <a href={content.access_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir em nova aba
            </a>
          </Button>
        </div>
      );
    }

    // Link externo
    return (
      <div className="text-center py-8">
        <LinkIcon className="h-12 w-12 mx-auto mb-4 text-primary" />
        <p className="mb-4">Este conteúdo está disponível em um link externo.</p>
        <Button asChild>
          <a href={content.access_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Acessar Conteúdo
          </a>
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container py-8 max-w-4xl">
        <div className="text-center py-12">
          <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!training) {
    return (
      <div className="container py-8 max-w-4xl">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Treinamento não encontrado.</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push("/employee/treinamentos")}>
              Voltar para Treinamentos
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/employee/treinamentos")} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold">{training.training_title}</h1>
          {training.training_description && (
            <p className="text-muted-foreground mt-1">{training.training_description}</p>
          )}
        </div>
        <Badge
          variant="outline"
          className={
            training.status === "completed"
              ? "bg-green-100 text-green-700"
              : training.status === "in_progress"
              ? "bg-blue-100 text-blue-700"
              : "bg-yellow-100 text-yellow-700"
          }
        >
          {training.status === "completed" ? "Concluído" : training.status === "in_progress" ? "Em Andamento" : "Pendente"}
        </Badge>
      </div>

      {/* Progress */}
      {training.status !== "completed" && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">Progresso</span>
              <span className="text-sm font-medium">{training.progress_percent}%</span>
            </div>
            <Progress value={training.progress_percent} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Content */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {content && getContentIcon(content.content_type)}
            {content?.title || "Conteúdo do Treinamento"}
          </CardTitle>
          {training.duration_minutes && (
            <CardDescription>Duração estimada: {training.duration_minutes} minutos</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {renderContent()}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 justify-center">
        {training.status === "pending" && (
          <Button onClick={handleStart}>
            <Play className="h-4 w-4 mr-2" />
            Iniciar Treinamento
          </Button>
        )}

        {training.status !== "completed" && (
          <Button onClick={handleComplete} disabled={completing}>
            {completing ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Marcar como Concluído
          </Button>
        )}

        {training.status === "completed" && training.has_certificate && (
          <Button variant="outline" onClick={() => router.push("/employee/certificados")}>
            Ver Certificado
          </Button>
        )}
      </div>

      {/* Completed message */}
      {training.status === "completed" && (
        <Card className="mt-6 bg-green-50 border-green-200">
          <CardContent className="py-4 text-center">
            <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 mb-2" />
            <p className="text-green-800 font-medium">Treinamento Concluído!</p>
            {training.completed_at && (
              <p className="text-sm text-green-600 mt-1">
                Concluído em {new Date(training.completed_at).toLocaleDateString("pt-BR")}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}