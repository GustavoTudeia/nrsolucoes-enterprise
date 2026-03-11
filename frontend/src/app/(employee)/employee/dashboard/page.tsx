"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { employeeLogout } from "@/lib/api/auth";
import {
  GraduationCap, Award, User, LogOut, RefreshCw,
  Clock, CheckCircle2, AlertTriangle, ArrowRight
} from "lucide-react";

interface DashboardStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
  certificates: number;
}

interface EmployeeProfile {
  id: string;
  identifier: string;
  full_name: string | null;
  email: string | null;
}

export default function EmployeeDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<EmployeeProfile | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    setLoading(true);
    try {
      // Buscar perfil
      const meRes = await fetch("/api/bff/employee/employee/me", {
        credentials: "include",
      });
      
      if (!meRes.ok) {
        if (meRes.status === 401) {
          router.push("/");
          return;
        }
        throw new Error("Erro ao carregar perfil");
      }
      
      const meData = await meRes.json();
      setMe(meData);

      // Buscar treinamentos para calcular stats
      const trainingsRes = await fetch("/api/bff/employee/employee/me/trainings", {
        credentials: "include",
      });

      if (trainingsRes.ok) {
        const trainings = await trainingsRes.json();
        const statsData: DashboardStats = {
          total: trainings.length,
          pending: trainings.filter((t: any) => t.status === "pending").length,
          in_progress: trainings.filter((t: any) => t.status === "in_progress").length,
          completed: trainings.filter((t: any) => t.status === "completed").length,
          overdue: trainings.filter((t: any) => t.is_overdue).length,
          certificates: trainings.filter((t: any) => t.has_certificate).length,
        };
        setStats(statsData);
      }
    } catch (e: any) {
      toast.error(e?.message || "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await employeeLogout();
    window.location.href = "/";
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <div className="container py-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Portal do Colaborador</h1>
          <p className="text-muted-foreground mt-1">
            Treinamentos e certificados do programa NR-1
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadDashboard} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="h-4 w-4 mr-1" />
            Sair
          </Button>
        </div>
      </div>

      {/* Perfil */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-4 w-4" />
            Meu Perfil
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Carregando...</p>
          ) : me ? (
            <div className="grid gap-1 text-sm">
              <p><span className="text-muted-foreground">Nome:</span> {me.full_name || "—"}</p>
              <p><span className="text-muted-foreground">Identificador:</span> {me.identifier}</p>
              {me.email && <p><span className="text-muted-foreground">Email:</span> {me.email}</p>}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Não foi possível carregar o perfil</p>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.pending}</div>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.in_progress}</div>
                  <p className="text-xs text-muted-foreground">Em Andamento</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.completed}</div>
                  <p className="text-xs text-muted-foreground">Concluídos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <div>
                  <div className="text-2xl font-bold">{stats.overdue}</div>
                  <p className="text-xs text-muted-foreground">Atrasados</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ações Rápidas */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => router.push("/employee/treinamentos")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              Meus Treinamentos
            </CardTitle>
            <CardDescription>
              Visualize e conclua seus treinamentos obrigatórios
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {stats ? (
                  <>
                    {stats.pending + stats.in_progress > 0 ? (
                      <span className="text-yellow-600 font-medium">
                        {stats.pending + stats.in_progress} treinamento(s) pendente(s)
                      </span>
                    ) : (
                      <span className="text-green-600">Todos os treinamentos concluídos!</span>
                    )}
                  </>
                ) : (
                  "Carregando..."
                )}
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition cursor-pointer" onClick={() => router.push("/employee/certificados")}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              Meus Certificados
            </CardTitle>
            <CardDescription>
              Visualize e baixe seus certificados de conclusão
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {stats ? (
                  <span>{stats.certificates} certificado(s) disponível(is)</span>
                ) : (
                  "Carregando..."
                )}
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aviso NR-1 */}
      <Card className="mt-6 bg-blue-50 border-blue-200">
        <CardContent className="pt-4">
          <p className="text-sm text-blue-800">
            <strong>📋 Programa NR-1:</strong> Os treinamentos listados fazem parte do Programa de Gerenciamento de Riscos (PGR) 
            da sua empresa. A conclusão é obrigatória conforme a Norma Regulamentadora nº 1.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}