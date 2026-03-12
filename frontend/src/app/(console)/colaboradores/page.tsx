"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  createEmployee,
  updateEmployee,
  deleteEmployee,
  inviteEmployee,
  listEmployees,
  importEmployees,
  type EmployeeImportRow,
  type EmployeeImportResult,
} from "@/lib/api/employees";
import { listUnits } from "@/lib/api/org";
import type { EmployeeOut, OrgUnitOut } from "@/lib/api/types";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Trash2, Upload, X } from "lucide-react";

// ============== IMPORT XLS COMPONENT ==============
interface ImportPreviewRow extends EmployeeImportRow {
  _rowNum: number;
  _status: "valid" | "error" | "duplicate" | "pending";
  _error?: string;
}

function ImportModal({
  open,
  onClose,
  units,
  onImportComplete,
}: {
  open: boolean;
  onClose: () => void;
  units: OrgUnitOut[];
  onImportComplete: () => void;
}) {
  const [step, setStep] = useState<"upload" | "preview" | "result">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [previewRows, setPreviewRows] = useState<ImportPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<EmployeeImportResult | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const unitMap = useMemo(() => {
    const map: Record<string, OrgUnitOut> = {};
    for (const u of units) {
      map[u.id] = u;
      map[u.name.toLowerCase()] = u;
    }
    return map;
  }, [units]);

  const resetState = useCallback(() => {
    setStep("upload");
    setFile(null);
    setPreviewRows([]);
    setResult(null);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Parse CSV/XLS content
  const parseFile = async (f: File) => {
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    
    if (lines.length < 2) {
      toast.error("Arquivo vazio ou sem dados");
      return;
    }

    // Detectar separador (vírgula ou ponto-e-vírgula)
    const separator = lines[0].includes(";") ? ";" : ",";
    
    // Parse header
    const header = lines[0].split(separator).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    const identifierIdx = header.findIndex((h) => ["identificador", "identifier", "email", "cpf", "matricula", "id"].includes(h));
    const nameIdx = header.findIndex((h) => ["nome", "name", "full_name", "nome_completo"].includes(h));
    const unitIdx = header.findIndex((h) => ["setor", "unidade", "unit", "org_unit", "departamento"].includes(h));

    if (identifierIdx === -1) {
      toast.error("Coluna 'identificador' (ou 'email', 'cpf', 'matricula') não encontrada");
      return;
    }

    const rows: ImportPreviewRow[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(separator).map((c) => c.trim().replace(/"/g, ""));
      const identifier = cols[identifierIdx] || "";
      const fullName = nameIdx >= 0 ? cols[nameIdx] : undefined;
      const unitStr = unitIdx >= 0 ? cols[unitIdx] : undefined;

      // Resolver org_unit_id pelo nome ou ID
      let orgUnitId: string | undefined;
      if (unitStr) {
        const found = unitMap[unitStr] || unitMap[unitStr.toLowerCase()];
        if (found) {
          orgUnitId = found.id;
        }
      }

      // Validação
      let status: ImportPreviewRow["_status"] = "valid";
      let error: string | undefined;

      if (!identifier) {
        status = "error";
        error = "Identificador vazio";
      } else if (identifier.length < 3) {
        status = "error";
        error = "Identificador muito curto (mín. 3 caracteres)";
      } else if (unitStr && !orgUnitId) {
        status = "error";
        error = `Setor "${unitStr}" não encontrado`;
      }

      // Checar duplicatas dentro do próprio arquivo
      if (status === "valid") {
        const isDuplicate = rows.some((r) => r.identifier.toLowerCase() === identifier.toLowerCase());
        if (isDuplicate) {
          status = "duplicate";
          error = "Duplicado no arquivo";
        }
      }

      rows.push({
        _rowNum: i + 1,
        _status: status,
        _error: error,
        identifier,
        full_name: fullName,
        org_unit_id: orgUnitId,
      });
    }

    setPreviewRows(rows);
    setStep("preview");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      parseFile(f);
    }
  };

  const validRows = previewRows.filter((r) => r._status === "valid");
  const errorRows = previewRows.filter((r) => r._status === "error");
  const duplicateRows = previewRows.filter((r) => r._status === "duplicate");

  const handleImport = async () => {
    if (validRows.length === 0) {
      toast.error("Nenhum registro válido para importar");
      return;
    }

    setImporting(true);
    try {
      const payload: EmployeeImportRow[] = validRows.map((r) => ({
        identifier: r.identifier,
        full_name: r.full_name,
        org_unit_id: r.org_unit_id,
      }));

      const res = await importEmployees(payload, skipDuplicates);
      setResult(res);
      setStep("result");
      
      if (res.created > 0) {
        toast.success(`${res.created} colaborador(es) importado(s)`);
        onImportComplete();
      }
    } catch (e: any) {
      toast.error(e?.message || "Falha na importação");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = `identificador;nome;setor
joao@empresa.com;João Silva;Financeiro
maria@empresa.com;Maria Santos;RH
pedro@empresa.com;Pedro Costa;TI`;
    
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_colaboradores.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Importar Colaboradores
          </DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6">
            <div className="rounded-lg border-2 border-dashed p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <div className="mt-4">
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-primary font-medium">Clique para selecionar</span>
                  <span className="text-muted-foreground"> ou arraste o arquivo</span>
                </Label>
                <Input
                  id="file-upload"
                  type="file"
                  accept=".csv,.txt,.xls,.xlsx"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">CSV, TXT ou Excel (até 10MB)</p>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <div className="font-medium text-sm">Formato esperado:</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>• Primeira linha: cabeçalho com nomes das colunas</p>
                <p>• Coluna obrigatória: <code className="bg-muted px-1 rounded">identificador</code> (ou email, cpf, matricula)</p>
                <p>• Colunas opcionais: <code className="bg-muted px-1 rounded">nome</code>, <code className="bg-muted px-1 rounded">setor</code></p>
                <p>• Separador: vírgula (,) ou ponto-e-vírgula (;)</p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Baixar modelo CSV
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-emerald-600">{validRows.length}</div>
                <div className="text-xs text-muted-foreground">Válidos</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{duplicateRows.length}</div>
                <div className="text-xs text-muted-foreground">Duplicados</div>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{errorRows.length}</div>
                <div className="text-xs text-muted-foreground">Com erro</div>
              </div>
            </div>

            {/* Options */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="skip-duplicates"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="skip-duplicates" className="text-sm">
                Ignorar duplicados existentes no sistema
              </Label>
            </div>

            {/* Preview table */}
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Linha</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Identificador</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Setor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 100).map((row) => (
                    <TableRow key={row._rowNum} className={row._status === "error" ? "bg-red-50" : row._status === "duplicate" ? "bg-amber-50" : ""}>
                      <TableCell className="text-muted-foreground">{row._rowNum}</TableCell>
                      <TableCell>
                        {row._status === "valid" && <Badge variant="default" className="bg-emerald-500">OK</Badge>}
                        {row._status === "error" && (
                          <Badge variant="destructive" title={row._error}>
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Erro
                          </Badge>
                        )}
                        {row._status === "duplicate" && (
                          <Badge variant="secondary" title={row._error}>Duplicado</Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{row.identifier}</TableCell>
                      <TableCell>{row.full_name || "-"}</TableCell>
                      <TableCell className="text-sm">
                        {row.org_unit_id ? units.find((u) => u.id === row.org_unit_id)?.name : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {previewRows.length > 100 && (
                <div className="p-2 text-center text-xs text-muted-foreground">
                  Mostrando 100 de {previewRows.length} registros
                </div>
              )}
            </div>

            {/* Errors detail */}
            {errorRows.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="font-medium text-red-800 text-sm mb-2">Erros encontrados:</div>
                <ul className="text-xs text-red-700 space-y-1 max-h-24 overflow-y-auto">
                  {errorRows.slice(0, 10).map((r) => (
                    <li key={r._rowNum}>Linha {r._rowNum}: {r._error}</li>
                  ))}
                  {errorRows.length > 10 && <li>...e mais {errorRows.length - 10} erros</li>}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <div className="mt-4 text-lg font-semibold text-emerald-800">
                Importação concluída!
              </div>
              <div className="mt-2 text-sm text-emerald-700">
                {result.created} colaborador(es) criado(s)
                {result.skipped > 0 && `, ${result.skipped} ignorado(s)`}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="font-medium text-amber-800 text-sm mb-2">
                  {result.errors.length} registro(s) não importado(s):
                </div>
                <ul className="text-xs text-amber-700 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Linha {e.row}{e.identifier ? ` (${e.identifier})` : ""}: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === "upload" && (
            <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={resetState}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0}>
                {importing ? "Importando..." : `Importar ${validRows.length} colaborador(es)`}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={handleClose}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== MAIN PAGE ==============
export default function ColaboradoresPage() {
  const { scope } = useConsole();
  const [employees, setEmployees] = useState<EmployeeOut[]>([]);
  const [units, setUnits] = useState<OrgUnitOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);

  // Form criar
  const [identifier, setIdentifier] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgUnitId, setOrgUnitId] = useState<string>("");

  // Dialog editar
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<EmployeeOut | null>(null);
  const [editIdentifier, setEditIdentifier] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editOrgUnitId, setEditOrgUnitId] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  // Dialog deletar
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<EmployeeOut | null>(null);

  // Dialog importar
  const [importOpen, setImportOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [e, u] = await Promise.all([
        listEmployees(showInactive),
        listUnits(scope.cnpjId || undefined, true),
      ]);
      setEmployees(e);
      setUnits(u.filter((x) => x.is_active));
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar colaboradores");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [scope.cnpjId, showInactive]);

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);

  async function onCreate() {
    try {
      await createEmployee({ identifier, full_name: fullName, org_unit_id: orgUnitId || null });
      toast.success("Colaborador cadastrado");
      setIdentifier("");
      setFullName("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao cadastrar colaborador");
    }
  }

  function openEdit(row: EmployeeOut) {
    setEditRow(row);
    setEditIdentifier(row.identifier);
    setEditFullName(row.full_name || "");
    setEditOrgUnitId(row.org_unit_id || "");
    setEditIsActive(row.is_active ?? false);
    setEditOpen(true);
  }

  async function onSaveEdit() {
    if (!editRow) return;
    try {
      await updateEmployee(editRow.id, {
        identifier: editIdentifier,
        full_name: editFullName,
        org_unit_id: editOrgUnitId || null,
        is_active: editIsActive,
      });
      toast.success("Colaborador atualizado");
      setEditOpen(false);
      setEditRow(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar");
    }
  }

  function openDelete(row: EmployeeOut) {
    setDeleteRow(row);
    setDeleteOpen(true);
  }

  async function onConfirmDelete() {
    if (!deleteRow) return;
    try {
      await deleteEmployee(deleteRow.id);
      toast.success("Colaborador excluído");
      setDeleteOpen(false);
      setDeleteRow(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao excluir");
    }
  }

  async function onInvite(id: string) {
    try {
      const r = await inviteEmployee(id);
      const apiUrl = r.magic_link_api_url || "";
      const token = apiUrl.split("/").pop() || r.token_dev || "";
      const friendly = `${window.location.origin}/employee/magic/${token}`;
      navigator.clipboard.writeText(friendly).catch(() => {});
      toast.success("Link copiado!");
      alert(`Link do colaborador (copiado):\n\n${friendly}`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao gerar convite");
    }
  }

  return (
    <div className="container py-8 space-y-6">
      <PageHeader
        title="Colaboradores"
        description="Cadastro, edição e importação em lote de colaboradores."
      />

      {/* Card Novo + Importar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Novo colaborador</CardTitle>
              <CardDescription>
                Cadastre individualmente ou importe uma lista.
              </CardDescription>
            </div>
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Importar XLS/CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Identificador *</Label>
            <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="email ou matrícula" />
          </div>
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nome completo" />
          </div>
          <div className="space-y-2">
            <Label>Setor/Unidade</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
              <option value="">(sem)</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button onClick={onCreate} disabled={!identifier || !fullName}>Cadastrar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista ({employees.length})</CardTitle>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded"
              />
              Mostrar inativos
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Identificador</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : employees.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nenhum colaborador cadastrado.</TableCell></TableRow>
              ) : (
                employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.full_name || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{e.identifier}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.org_unit_id ? unitMap.get(e.org_unit_id)?.name || "-" : "-"}
                    </TableCell>
                    <TableCell>
                      {e.is_active ? (
                        <Badge variant="default" className="bg-emerald-500">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => onInvite(e.id)}>
                          Link
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(e)}>
                          Editar
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => openDelete(e)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Editar */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Colaborador</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Identificador</Label>
              <Input value={editIdentifier} onChange={(e) => setEditIdentifier(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Setor/Unidade</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={editOrgUnitId} onChange={(e) => setEditOrgUnitId(e.target.value)}>
                <option value="">(sem)</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="edit-active"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="edit-active">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={onSaveEdit} disabled={!editIdentifier}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Deletar */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Excluir Colaborador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Esta ação é irreversível. O colaborador será removido permanentemente.
            </p>
            {deleteRow && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div><span className="font-medium">Nome:</span> {deleteRow.full_name}</div>
                <div><span className="font-medium">Identificador:</span> {deleteRow.identifier}</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={onConfirmDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Importar */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        units={units}
        onImportComplete={refresh}
      />
    </div>
  );
}
