"use client";

/**
 * Componente de Matrículas em Treinamentos
 * 
 * Este componente gerencia:
 * - Visualização de matrículas de um item educativo
 * - Matrícula em lote de colaboradores
 * - Acompanhamento de progresso
 * - Geração de certificados
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Users,
  GraduationCap,
  Award,
  UserPlus,
  FileDown,
  RefreshCw,
  Mail,
  XCircle,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api/client";

// Types
interface EnrollmentStats {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  expired: number;
  cancelled: number;
  completion_rate: number;
  overdue_count: number;
  avg_completion_days: number | null;
  certificates_issued: number;
}

interface Enrollment {
  id: string;
  action_item_id: string;
  employee_id: string;
  employee_name: string | null;
  employee_identifier: string | null;
  employee_email: string | null;
  status: string;
  progress_percent: number;
  enrolled_at: string;
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  is_overdue: boolean;
  days_until_due: number | null;
  certificate_id: string | null;
}

interface OrgUnit {
  id: string;
  name: string;
  unit_type: string;
}

interface Props {
  itemId: string;
  itemTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onEnrollmentChange?: () => void;
}

export function EnrollmentManager({
  itemId,
  itemTitle,
  isOpen,
  onClose,
  onEnrollmentChange,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  
  // Form state
  const [targetType, setTargetType] = useState<string>("org_unit");
  const [selectedOrgUnit, setSelectedOrgUnit] = useState<string>("");
  const [dueDays, setDueDays] = useState<number>(30);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Carregar dados
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Carregar estatísticas
      const statsRes = await apiFetch<EnrollmentStats>("console", `/trainings/items/${itemId}/enrollment-stats`);
      setStats(statsRes);

      // Carregar matrículas
      const enrollRes = await apiFetch<{ items: Enrollment[] }>(
        "console", `/trainings/items/${itemId}/enrollments?limit=100${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`
      );
      setEnrollments(enrollRes.items || []);

      // Carregar unidades
      const orgRes = await apiFetch<{ items: OrgUnit[] }>("console", "/org/units");
      setOrgUnits(orgRes.items || []);
    } catch (error) {
      toast({
        title: "Erro ao carregar dados",
        description: "Não foi possível carregar as matrículas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [itemId, statusFilter, toast]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  // Matricular colaboradores
  const handleEnroll = async () => {
    if (targetType === "org_unit" && !selectedOrgUnit) {
      toast({
        title: "Selecione uma unidade",
        description: "É necessário selecionar uma unidade organizacional",
        variant: "destructive",
      });
      return;
    }

    setEnrolling(true);
    try {
      const payload: any = {
        target_type: targetType,
        due_days: dueDays,
      };

      if (targetType === "org_unit") {
        payload.org_unit_id = selectedOrgUnit;
      }

      const result = await apiFetch<{ enrolled: number; already_enrolled: number }>("console", `/trainings/items/${itemId}/enrollments`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      toast({
        title: "Matrículas realizadas",
        description: `${result.enrolled} colaboradores matriculados. ${result.already_enrolled} já estavam matriculados.`,
      });

      loadData();
      onEnrollmentChange?.();
    } catch (error) {
      toast({
        title: "Erro ao matricular",
        description: "Não foi possível realizar as matrículas",
        variant: "destructive",
      });
    } finally {
      setEnrolling(false);
    }
  };

  // Marcar como concluído
  const handleComplete = async (enrollmentId: string) => {
    try {
      await apiFetch("console", `/trainings/enrollments/${enrollmentId}/complete`, {
        method: "POST",
      });

      toast({
        title: "Treinamento concluído",
        description: "Certificado gerado com sucesso",
      });

      loadData();
      onEnrollmentChange?.();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível concluir o treinamento",
        variant: "destructive",
      });
    }
  };

  // Cancelar matrícula
  const handleCancel = async (enrollmentId: string) => {
    try {
      await apiFetch("console", `/trainings/enrollments/${enrollmentId}`, {
        method: "DELETE",
      });

      toast({
        title: "Matrícula cancelada",
      });

      loadData();
      onEnrollmentChange?.();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível cancelar a matrícula",
        variant: "destructive",
      });
    }
  };

  // Download relatório
  const handleDownloadReport = async () => {
    try {
      const report = await apiFetch("console", `/trainings/items/${itemId}/report`);
      
      // Criar e baixar JSON
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-treinamento-${itemId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível gerar o relatório",
        variant: "destructive",
      });
    }
  };

  // Helpers
  const getStatusBadge = (status: string, isOverdue: boolean) => {
    if (isOverdue && status !== "completed") {
      return <Badge variant="destructive">Atrasado</Badge>;
    }
    
    const variants: Record<string, any> = {
      pending: { variant: "secondary", label: "Pendente", icon: Clock },
      in_progress: { variant: "default", label: "Em Andamento", icon: RefreshCw },
      completed: { variant: "default", label: "Concluído", icon: CheckCircle2 },
      expired: { variant: "destructive", label: "Expirado", icon: XCircle },
      cancelled: { variant: "outline", label: "Cancelado", icon: XCircle },
    };
    
    const config = variants[status] || variants.pending;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("pt-BR");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5" />
            Matrículas em Treinamento
          </DialogTitle>
          <DialogDescription>{itemTitle}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="enrollments">Matrículas</TabsTrigger>
            <TabsTrigger value="enroll">Nova Matrícula</TabsTrigger>
          </TabsList>

          {/* Tab: Visão Geral */}
          <TabsContent value="overview" className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : stats ? (
              <>
                {/* Cards de estatísticas */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{stats.total}</div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Concluídos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {stats.completed}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Pendentes
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-yellow-600">
                        {stats.pending + stats.in_progress}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Atrasados
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">
                        {stats.overdue_count}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Progresso geral */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Taxa de Conclusão</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>{stats.completed} de {stats.total} colaboradores</span>
                        <span className="font-bold">{stats.completion_rate}%</span>
                      </div>
                      <Progress value={stats.completion_rate} className="h-3" />
                    </div>
                  </CardContent>
                </Card>

                {/* Certificados */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">Certificados Emitidos</CardTitle>
                      <CardDescription>
                        {stats.certificates_issued} certificados gerados
                      </CardDescription>
                    </div>
                    <Award className="h-8 w-8 text-yellow-500" />
                  </CardHeader>
                </Card>

                {/* Botões de ação */}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleDownloadReport}>
                    <FileDown className="h-4 w-4 mr-2" />
                    Exportar Relatório
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </TabsContent>

          {/* Tab: Lista de Matrículas */}
          <TabsContent value="enrollments" className="space-y-4">
            <div className="flex justify-between items-center">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filtrar por status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="in_progress">Em Andamento</SelectItem>
                  <SelectItem value="completed">Concluídos</SelectItem>
                  <SelectItem value="expired">Expirados</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" size="sm" onClick={loadData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Atualizar
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : enrollments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma matrícula encontrada</p>
                <p className="text-sm">Matricule colaboradores na aba "Nova Matrícula"</p>
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colaborador</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Progresso</TableHead>
                      <TableHead>Prazo</TableHead>
                      <TableHead>Certificado</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollments.map((enrollment) => (
                      <TableRow key={enrollment.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {enrollment.employee_name || enrollment.employee_identifier}
                            </div>
                            {enrollment.employee_email && (
                              <div className="text-sm text-muted-foreground">
                                {enrollment.employee_email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(enrollment.status, enrollment.is_overdue)}
                        </TableCell>
                        <TableCell>
                          <div className="w-24">
                            <Progress value={enrollment.progress_percent} className="h-2" />
                            <span className="text-xs text-muted-foreground">
                              {enrollment.progress_percent}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {formatDate(enrollment.due_date)}
                            {enrollment.days_until_due !== null && enrollment.status !== "completed" && (
                              <div className={`text-xs ${enrollment.days_until_due < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                                {enrollment.days_until_due < 0
                                  ? `${Math.abs(enrollment.days_until_due)} dias atrás`
                                  : `${enrollment.days_until_due} dias restantes`}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {enrollment.certificate_id ? (
                            <Badge variant="default" className="gap-1 bg-green-600">
                              <Award className="h-3 w-3" />
                              Emitido
                            </Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {enrollment.status !== "completed" && enrollment.status !== "cancelled" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleComplete(enrollment.id)}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCancel(enrollment.id)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Tab: Nova Matrícula */}
          <TabsContent value="enroll" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-5 w-5" />
                  Matricular Colaboradores
                </CardTitle>
                <CardDescription>
                  Selecione o público-alvo e o prazo para conclusão do treinamento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Público-alvo</Label>
                  <Select value={targetType} onValueChange={setTargetType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_employees">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Todos os colaboradores
                        </div>
                      </SelectItem>
                      <SelectItem value="org_unit">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Por unidade/setor
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {targetType === "org_unit" && (
                  <div className="space-y-2">
                    <Label>Unidade Organizacional</Label>
                    <Select value={selectedOrgUnit} onValueChange={setSelectedOrgUnit}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma unidade" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgUnits.map((unit) => (
                          <SelectItem key={unit.id} value={unit.id}>
                            {unit.name} ({unit.unit_type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Inclui colaboradores de todas as subunidades
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Prazo para conclusão (dias)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={dueDays}
                    onChange={(e) => setDueDays(parseInt(e.target.value) || 30)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Colaboradores terão {dueDays} dias para concluir o treinamento
                  </p>
                </div>

                <Button
                  className="w-full"
                  onClick={handleEnroll}
                  disabled={enrolling || (targetType === "org_unit" && !selectedOrgUnit)}
                >
                  {enrolling ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Matriculando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Matricular Colaboradores
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-md">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  <p className="font-medium">Como funciona:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Cada colaborador receberá uma matrícula individual</li>
                    <li>Eles poderão acessar o treinamento pelo Portal do Colaborador</li>
                    <li>Ao concluir, um certificado será gerado automaticamente</li>
                    <li>O certificado será adicionado como evidência do item</li>
                  </ul>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default EnrollmentManager;
