"use client";

/**
 * Componente de Matrículas para Item Educativo
 * 
 * Exibe e gerencia matrículas de colaboradores em itens educativos do plano de ação.
 * Permite:
 * - Visualizar matrículas existentes
 * - Definir público-alvo e matricular em lote
 * - Acompanhar progresso
 * - Gerar certificados
 */

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Users, UserPlus, CheckCircle2, Clock, AlertTriangle, 
  Award, RefreshCw, Download, Building2, User
} from "lucide-react";
import { 
  enrollEmployees, listEnrollments, getEnrollmentStats, 
  generateCertificates, type EnrollTargetPayload 
} from "@/lib/api/trainings";
import type { EnrollmentOut, EnrollmentStats } from "@/lib/api/trainings";

interface EnrollmentsTabProps {
  itemId: string;
  itemType: string;
  onUpdate?: () => void;
  orgUnits?: Array<{ id: string; name: string }>;
  cnpjs?: Array<{ id: string; legal_name: string }>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-yellow-100 text-yellow-700" },
  in_progress: { label: "Em Andamento", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Concluído", color: "bg-green-100 text-green-700" },
  expired: { label: "Expirado", color: "bg-red-100 text-red-700" },
  excused: { label: "Dispensado", color: "bg-gray-100 text-gray-600" },
};

export default function EnrollmentsTab({ itemId, itemType, onUpdate, orgUnits = [], cnpjs = [] }: EnrollmentsTabProps) {
  const [enrollments, setEnrollments] = useState<EnrollmentOut[]>([]);
  const [stats, setStats] = useState<EnrollmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Formulário de matrícula
  const [targetType, setTargetType] = useState<string>("org_unit");
  const [targetOrgUnitId, setTargetOrgUnitId] = useState<string>("");
  const [targetCnpjId, setTargetCnpjId] = useState<string>("");
  const [dueDays, setDueDays] = useState<number>(30);

  // Não é um item educativo
  if (itemType !== "educational") {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Matrículas só estão disponíveis para itens do tipo <b>Educativo</b>.</p>
      </div>
    );
  }

  async function loadData() {
    setLoading(true);
    try {
      const [enrollRes, statsRes] = await Promise.all([
        listEnrollments(itemId, { include_employee: true, limit: 100 }),
        getEnrollmentStats(itemId),
      ]);
      setEnrollments(enrollRes.items || []);
      setStats(statsRes);
    } catch (e: any) {
      toast.error("Erro ao carregar matrículas");
    } finally {
      setLoading(false);
    }
  }

  async function handleEnroll() {
    setEnrolling(true);
    try {
      const payload: EnrollTargetPayload = {
        target_type: targetType as any,
        due_days: dueDays,
      };
      
      if (targetType === "org_unit" && targetOrgUnitId) {
        payload.target_org_unit_id = targetOrgUnitId;
      } else if (targetType === "cnpj" && targetCnpjId) {
        payload.target_cnpj_id = targetCnpjId;
      }
      
      const result = await enrollEmployees(itemId, payload);
      
      toast.success(`${result.enrolled} colaborador(es) matriculado(s)!`);
      if (result.already_enrolled > 0) {
        toast.info(`${result.already_enrolled} já estavam matriculados.`);
      }
      
      setEnrollDialogOpen(false);
      loadData();
      onUpdate?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao matricular");
    } finally {
      setEnrolling(false);
    }
  }

  async function handleGenerateCertificates() {
    setGenerating(true);
    try {
      const result = await generateCertificates(itemId);
      
      if (result.generated > 0) {
        toast.success(`${result.generated} certificado(s) gerado(s)!`);
      } else if (result.already_enrolled > 0) {
        toast.info("Todos os certificados já foram gerados.");
      } else {
        toast.info("Nenhum colaborador elegível para certificado.");
      }
      
      loadData();
      onUpdate?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao gerar certificados");
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [itemId]);

  const completionPct = stats ? stats.completion_rate : 0;

  return (
    <div className="space-y-4">
      {/* Estatísticas */}
      {stats && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Progresso de Treinamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>{stats.completed} de {stats.total} concluídos</span>
                <span className="font-medium">{completionPct.toFixed(0)}%</span>
              </div>
              <Progress value={completionPct} className="h-2" />
              
              <div className="grid grid-cols-3 gap-2 text-center text-xs mt-3">
                <div className="p-2 rounded bg-yellow-50">
                  <div className="font-semibold text-yellow-700">{stats.pending}</div>
                  <div className="text-muted-foreground">Pendentes</div>
                </div>
                <div className="p-2 rounded bg-blue-50">
                  <div className="font-semibold text-blue-700">{stats.in_progress}</div>
                  <div className="text-muted-foreground">Em Andamento</div>
                </div>
                <div className="p-2 rounded bg-green-50">
                  <div className="font-semibold text-green-700">{stats.completed}</div>
                  <div className="text-muted-foreground">Concluídos</div>
                </div>
              </div>
              
              {stats.overdue_count > 0 && (
                <div className="flex items-center gap-2 text-sm text-red-600 mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  {stats.overdue_count} colaborador(es) atrasado(s)
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ações */}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setEnrollDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" />
          Matricular
        </Button>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={handleGenerateCertificates}
          disabled={generating || !stats || stats.completed === 0}
        >
          {generating ? (
            <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Award className="h-4 w-4 mr-1" />
          )}
          Gerar Certificados
        </Button>
        <Button size="sm" variant="ghost" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Lista de Matrículas */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin" />
          Carregando...
        </div>
      ) : enrollments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Nenhum colaborador matriculado ainda.</p>
          <p className="text-sm mt-1">Clique em "Matricular" para definir o público-alvo.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Progresso</TableHead>
                <TableHead>Prazo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrollments.map((enrollment) => {
                const statusConfig = STATUS_CONFIG[enrollment.status] || STATUS_CONFIG.pending;
                const dueDate = enrollment.due_date 
                  ? new Date(enrollment.due_date).toLocaleDateString("pt-BR")
                  : "-";
                
                return (
                  <TableRow key={enrollment.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {enrollment.employee?.full_name || enrollment.employee?.identifier || "—"}
                        </div>
                        {enrollment.employee?.org_unit_name && (
                          <div className="text-xs text-muted-foreground">
                            {enrollment.employee.org_unit_name}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusConfig.color}>
                        {statusConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={enrollment.progress_percent} className="h-1.5 w-16" />
                        <span className="text-xs">{enrollment.progress_percent}%</span>
                      </div>
                    </TableCell>
                    <TableCell className={enrollment.is_overdue ? "text-red-600 font-medium" : ""}>
                      {enrollment.is_overdue && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                      {dueDate}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog de Matrícula */}
      <Dialog open={enrollDialogOpen} onOpenChange={setEnrollDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Matricular Colaboradores</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
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
                      <Building2 className="h-4 w-4" />
                      Por unidade/setor
                    </div>
                  </SelectItem>
                  <SelectItem value="cnpj">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Por CNPJ
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {targetType === "org_unit" && (
              <div className="space-y-2">
                <Label>Unidade</Label>
                <Select value={targetOrgUnitId} onValueChange={setTargetOrgUnitId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {orgUnits.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {targetType === "cnpj" && (
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Select value={targetCnpjId} onValueChange={setTargetCnpjId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cnpjs.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Prazo para conclusão (dias)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={dueDays}
                onChange={e => setDueDays(parseInt(e.target.value) || 30)}
              />
              <p className="text-xs text-muted-foreground">
                Os colaboradores terão {dueDays} dias para concluir o treinamento.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEnrollDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEnroll} disabled={enrolling}>
              {enrolling ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Matriculando...
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1" />
                  Matricular
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
