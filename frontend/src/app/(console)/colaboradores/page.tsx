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
import { listCnpjs, listUnits } from "@/lib/api/org";
import type { CNPJOut, EmployeeOut, OrgUnitOut } from "@/lib/api/types";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import {
  AlertTriangle, Briefcase, CheckCircle2, ChevronDown, ChevronUp,
  Download, FileSpreadsheet, Plus, Search, Trash2, Upload, UserCheck,
  UserX, Users, X,
} from "lucide-react";

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

  const handleClose = () => { resetState(); onClose(); };

  const parseFile = async (f: File) => {
    const text = await f.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { toast.error("Arquivo vazio ou sem dados"); return; }
    const separator = lines[0].includes(";") ? ";" : ",";
    const header = lines[0].split(separator).map((h) => h.trim().toLowerCase().replace(/"/g, ""));
    const identifierIdx = header.findIndex((h) => ["identificador", "identifier", "matricula", "id"].includes(h));
    const nameIdx = header.findIndex((h) => ["nome", "name", "full_name", "nome_completo"].includes(h));
    const cpfIdx = header.findIndex((h) => ["cpf"].includes(h));
    const emailIdx = header.findIndex((h) => ["email", "e-mail", "e_mail"].includes(h));
    const phoneIdx = header.findIndex((h) => ["telefone", "phone", "celular", "tel"].includes(h));
    const jobIdx = header.findIndex((h) => ["cargo", "funcao", "job_title", "funcão"].includes(h));
    const admIdx = header.findIndex((h) => ["data_admissao", "admissao", "admission_date", "data admissao"].includes(h));
    const unitIdx = header.findIndex((h) => ["setor", "unidade", "unit", "org_unit", "departamento"].includes(h));
    if (identifierIdx === -1) { toast.error("Coluna 'identificador' nao encontrada"); return; }

    const rows: ImportPreviewRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(separator).map((c) => c.trim().replace(/"/g, ""));
      const identifier = cols[identifierIdx] || "";
      const fullName = nameIdx >= 0 ? cols[nameIdx] : undefined;
      const cpfVal = cpfIdx >= 0 ? cols[cpfIdx] : undefined;
      const emailVal = emailIdx >= 0 ? cols[emailIdx] : undefined;
      const phoneVal = phoneIdx >= 0 ? cols[phoneIdx] : undefined;
      const jobVal = jobIdx >= 0 ? cols[jobIdx] : undefined;
      const admVal = admIdx >= 0 ? cols[admIdx] : undefined;
      const unitStr = unitIdx >= 0 ? cols[unitIdx] : undefined;
      let orgUnitId: string | undefined;
      if (unitStr) { const found = unitMap[unitStr] || unitMap[unitStr.toLowerCase()]; if (found) orgUnitId = found.id; }
      let status: ImportPreviewRow["_status"] = "valid";
      let error: string | undefined;
      if (!identifier) { status = "error"; error = "Identificador vazio"; }
      else if (identifier.length < 3) { status = "error"; error = "Identificador muito curto"; }
      else if (unitStr && !orgUnitId) { status = "error"; error = `Setor "${unitStr}" nao encontrado`; }
      if (status === "valid" && rows.some((r) => r.identifier.toLowerCase() === identifier.toLowerCase())) {
        status = "duplicate"; error = "Duplicado no arquivo";
      }
      rows.push({
        _rowNum: i + 1, _status: status, _error: error, identifier,
        full_name: fullName, cpf: cpfVal, email: emailVal, phone: phoneVal,
        job_title: jobVal, admission_date: admVal, org_unit_id: orgUnitId,
      });
    }
    setPreviewRows(rows);
    setStep("preview");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); parseFile(f); }
  };

  const validRows = previewRows.filter((r) => r._status === "valid");
  const errorRows = previewRows.filter((r) => r._status === "error");
  const duplicateRows = previewRows.filter((r) => r._status === "duplicate");

  const handleImport = async () => {
    if (validRows.length === 0) { toast.error("Nenhum registro valido"); return; }
    setImporting(true);
    try {
      const payload: EmployeeImportRow[] = validRows.map((r) => ({
        identifier: r.identifier, full_name: r.full_name, cpf: r.cpf,
        email: r.email, phone: r.phone, job_title: r.job_title,
        admission_date: r.admission_date, org_unit_id: r.org_unit_id,
      }));
      const res = await importEmployees(payload, skipDuplicates);
      setResult(res); setStep("result");
      if (res.created > 0) { toast.success(`${res.created} colaborador(es) importado(s)`); onImportComplete(); }
    } catch (e: any) { toast.error(e?.message || "Falha na importacao"); }
    finally { setImporting(false); }
  };

  const downloadTemplate = () => {
    const csv = [
      "identificador;nome;cpf;email;telefone;cargo;data_admissao;setor",
      "joao@empresa.com;Joao Silva;12345678901;joao@empresa.com;11999990000;Analista;2024-01-15;Financeiro",
      "maria@empresa.com;Maria Santos;98765432100;maria@empresa.com;11988880000;Coordenadora;2023-06-01;RH",
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "modelo_colaboradores.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" /> Importar Colaboradores</DialogTitle>
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
                <Input id="file-upload" type="file" accept=".csv,.txt,.xls,.xlsx" onChange={handleFileChange} className="hidden" />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">CSV, TXT ou Excel (ate 10MB)</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-4 space-y-3">
              <div className="font-medium text-sm">Formato esperado:</div>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Coluna obrigatoria: <code className="bg-muted px-1 rounded">identificador</code> (ou matricula)</p>
                <p>Colunas opcionais: <code className="bg-muted px-1 rounded">nome</code>, <code className="bg-muted px-1 rounded">cpf</code>, <code className="bg-muted px-1 rounded">email</code>, <code className="bg-muted px-1 rounded">telefone</code>, <code className="bg-muted px-1 rounded">cargo</code>, <code className="bg-muted px-1 rounded">data_admissao</code>, <code className="bg-muted px-1 rounded">setor</code></p>
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4 mr-2" /> Baixar modelo CSV</Button>
            </div>
          </div>
        )}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg border p-3 text-center"><div className="text-2xl font-bold text-emerald-600">{validRows.length}</div><div className="text-xs text-muted-foreground">Validos</div></div>
              <div className="rounded-lg border p-3 text-center"><div className="text-2xl font-bold text-amber-600">{duplicateRows.length}</div><div className="text-xs text-muted-foreground">Duplicados</div></div>
              <div className="rounded-lg border p-3 text-center"><div className="text-2xl font-bold text-red-600">{errorRows.length}</div><div className="text-xs text-muted-foreground">Com erro</div></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="skip-duplicates" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="skip-duplicates" className="text-sm">Ignorar duplicados existentes no sistema</Label>
            </div>
            <div className="border rounded-lg max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Ln</TableHead><TableHead>Status</TableHead>
                    <TableHead>Identificador</TableHead><TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead><TableHead>Email</TableHead>
                    <TableHead>Cargo</TableHead><TableHead>Setor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 100).map((row) => (
                    <TableRow key={row._rowNum} className={row._status === "error" ? "bg-red-50" : row._status === "duplicate" ? "bg-amber-50" : ""}>
                      <TableCell className="text-muted-foreground text-xs">{row._rowNum}</TableCell>
                      <TableCell>
                        {row._status === "valid" && <Badge variant="default" className="bg-emerald-500">OK</Badge>}
                        {row._status === "error" && <Badge variant="destructive" title={row._error}><AlertTriangle className="h-3 w-3 mr-1" />Erro</Badge>}
                        {row._status === "duplicate" && <Badge variant="secondary" title={row._error}>Dup</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.identifier}</TableCell>
                      <TableCell className="text-xs">{row.full_name || "-"}</TableCell>
                      <TableCell className="text-xs">{row.cpf || "-"}</TableCell>
                      <TableCell className="text-xs">{row.email || "-"}</TableCell>
                      <TableCell className="text-xs">{row.job_title || "-"}</TableCell>
                      <TableCell className="text-xs">{row.org_unit_id ? units.find((u) => u.id === row.org_unit_id)?.name : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {previewRows.length > 100 && <div className="p-2 text-center text-xs text-muted-foreground">Mostrando 100 de {previewRows.length}</div>}
            </div>
            {errorRows.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="font-medium text-red-800 text-sm mb-2">Erros:</div>
                <ul className="text-xs text-red-700 space-y-1 max-h-24 overflow-y-auto">
                  {errorRows.slice(0, 10).map((r) => <li key={r._rowNum}>Linha {r._rowNum}: {r._error}</li>)}
                  {errorRows.length > 10 && <li>...e mais {errorRows.length - 10}</li>}
                </ul>
              </div>
            )}
          </div>
        )}
        {step === "result" && result && (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-6 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <div className="mt-4 text-lg font-semibold text-emerald-800">Importacao concluida!</div>
              <div className="mt-2 text-sm text-emerald-700">{result.created} criado(s){result.skipped > 0 && `, ${result.skipped} ignorado(s)`}</div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="font-medium text-amber-800 text-sm mb-2">{result.errors.length} nao importado(s):</div>
                <ul className="text-xs text-amber-700 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((e, i) => <li key={i}>Linha {e.row}{e.identifier ? ` (${e.identifier})` : ""}: {e.error}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {step === "upload" && <Button variant="outline" onClick={handleClose}>Cancelar</Button>}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={resetState}>Voltar</Button>
              <Button onClick={handleImport} disabled={importing || validRows.length === 0}>{importing ? "Importando..." : `Importar ${validRows.length}`}</Button>
            </>
          )}
          {step === "result" && <Button onClick={handleClose}>Fechar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== MAIN PAGE ==============
export default function ColaboradoresPage() {
  const { scope } = useConsole();
  const [employees, setEmployees] = useState<EmployeeOut[]>([]);
  const [cnpjs, setCnpjs] = useState<CNPJOut[]>([]);
  const [units, setUnits] = useState<OrgUnitOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");

  // Form criar
  const [showForm, setShowForm] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [admissionDate, setAdmissionDate] = useState("");
  const [cnpjId, setCnpjId] = useState("");
  const [orgUnitId, setOrgUnitId] = useState("");

  // Dialog editar
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<EmployeeOut | null>(null);
  const [editIdentifier, setEditIdentifier] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editCpf, setEditCpf] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editJobTitle, setEditJobTitle] = useState("");
  const [editAdmissionDate, setEditAdmissionDate] = useState("");
  const [editCnpjId, setEditCnpjId] = useState("");
  const [editOrgUnitId, setEditOrgUnitId] = useState("");
  const [editIsActive, setEditIsActive] = useState(true);

  // Dialog deletar
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<EmployeeOut | null>(null);

  // Dialog expandir
  const [detailRow, setDetailRow] = useState<EmployeeOut | null>(null);

  // Dialog importar
  const [importOpen, setImportOpen] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const [e, u, c] = await Promise.all([
        listEmployees(showInactive),
        listUnits(scope.cnpjId || undefined, true),
        listCnpjs(false),
      ]);
      setEmployees(e);
      setUnits(u.filter((x) => x.is_active));
      setCnpjs(c);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar colaboradores");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [scope.cnpjId, showInactive]);

  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const cnpjMap = useMemo(() => new Map(cnpjs.map((c) => [c.id, c])), [cnpjs]);

  const filtered = useMemo(() => {
    if (!search.trim()) return employees;
    const s = search.toLowerCase();
    return employees.filter(
      (e) =>
        (e.full_name || "").toLowerCase().includes(s) ||
        e.identifier.toLowerCase().includes(s) ||
        (e.cpf || "").includes(s) ||
        (e.email || "").toLowerCase().includes(s) ||
        (e.job_title || "").toLowerCase().includes(s)
    );
  }, [employees, search]);

  const activeCount = employees.filter((e) => e.is_active).length;
  const inactiveCount = employees.filter((e) => !e.is_active).length;
  const withUnit = employees.filter((e) => e.org_unit_id).length;

  function resetForm() {
    setIdentifier(""); setFullName(""); setCpf(""); setEmail(""); setPhone("");
    setJobTitle(""); setAdmissionDate(""); setCnpjId(""); setOrgUnitId("");
  }

  async function onCreate() {
    try {
      await createEmployee({
        identifier, full_name: fullName,
        cpf: cpf || null, email: email || null, phone: phone || null,
        job_title: jobTitle || null,
        admission_date: admissionDate ? new Date(admissionDate).toISOString() : null,
        cnpj_id: cnpjId || null, org_unit_id: orgUnitId || null,
      });
      toast.success("Colaborador cadastrado");
      resetForm();
      setShowForm(false);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao cadastrar colaborador");
    }
  }

  function openEdit(row: EmployeeOut) {
    setEditRow(row);
    setEditIdentifier(row.identifier);
    setEditFullName(row.full_name || "");
    setEditCpf(row.cpf || "");
    setEditEmail(row.email || "");
    setEditPhone(row.phone || "");
    setEditJobTitle(row.job_title || "");
    setEditAdmissionDate(row.admission_date ? row.admission_date.slice(0, 10) : "");
    setEditCnpjId(row.cnpj_id || "");
    setEditOrgUnitId(row.org_unit_id || "");
    setEditIsActive(row.is_active ?? false);
    setEditOpen(true);
  }

  async function onSaveEdit() {
    if (!editRow) return;
    try {
      await updateEmployee(editRow.id, {
        identifier: editIdentifier, full_name: editFullName,
        cpf: editCpf || null, email: editEmail || null, phone: editPhone || null,
        job_title: editJobTitle || null,
        admission_date: editAdmissionDate ? new Date(editAdmissionDate).toISOString() : null,
        cnpj_id: editCnpjId || null, org_unit_id: editOrgUnitId || null,
        is_active: editIsActive,
      });
      toast.success("Colaborador atualizado");
      setEditOpen(false); setEditRow(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar");
    }
  }

  function openDelete(row: EmployeeOut) { setDeleteRow(row); setDeleteOpen(true); }

  async function onConfirmDelete() {
    if (!deleteRow) return;
    try {
      await deleteEmployee(deleteRow.id);
      toast.success("Colaborador excluido");
      setDeleteOpen(false); setDeleteRow(null);
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
        description="Cadastro, edicao e importacao em lote de colaboradores."
        right={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet className="h-4 w-4 mr-1" /> Importar CSV
            </Button>
            <Button onClick={() => setShowForm(true)} disabled={showForm}>
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          </div>
        }
      />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2.5"><Users className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">{employees.length}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2.5"><UserCheck className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-sm text-muted-foreground">Ativo{activeCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2.5"><UserX className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{inactiveCount}</p>
                <p className="text-sm text-muted-foreground">Inativo{inactiveCount !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2.5"><Briefcase className="h-5 w-5 text-violet-600" /></div>
              <div>
                <p className="text-2xl font-bold">{withUnit}</p>
                <p className="text-sm text-muted-foreground">Com setor</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Novo colaborador</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); resetForm(); }}><X className="h-4 w-4" /></Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Identificador *</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="email ou matricula" />
            </div>
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Joao Silva" />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" maxLength={14} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="joao@empresa.com" />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-0000" />
            </div>
            <div className="space-y-2">
              <Label>Cargo/Funcao</Label>
              <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Analista" />
            </div>
            <div className="space-y-2">
              <Label>Data admissao</Label>
              <Input type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={cnpjId} onChange={(e) => setCnpjId(e.target.value)}>
                <option value="">(sem)</option>
                {cnpjs.map((c) => <option key={c.id} value={c.id}>{c.trade_name || c.legal_name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Setor/Unidade</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)}>
                <option value="">(sem)</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-4 flex gap-2">
              <Button onClick={onCreate} disabled={!identifier || !fullName}>Cadastrar</Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle>Lista ({filtered.length}{filtered.length !== employees.length ? ` de ${employees.length}` : ""})</CardTitle>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9 w-64"
                  placeholder="Buscar nome, email, CPF, cargo..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded" />
                Inativos
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Identificador</TableHead>
                <TableHead className="hidden lg:table-cell">Cargo</TableHead>
                <TableHead className="hidden md:table-cell">Setor</TableHead>
                <TableHead className="hidden xl:table-cell">CNPJ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground">Carregando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-muted-foreground text-center py-8">
                  {search ? "Nenhum resultado para a busca." : "Nenhum colaborador cadastrado."}
                </TableCell></TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.id} className={`cursor-pointer ${!e.is_active ? "opacity-60" : ""}`} onClick={() => setDetailRow(e)}>
                    <TableCell className="font-medium">{e.full_name || "-"}</TableCell>
                    <TableCell className="font-mono text-sm">{e.identifier}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{e.job_title || "-"}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {e.org_unit_id ? unitMap.get(e.org_unit_id)?.name || "-" : "-"}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                      {e.cnpj_id ? (cnpjMap.get(e.cnpj_id)?.trade_name || cnpjMap.get(e.cnpj_id)?.legal_name || "-") : "-"}
                    </TableCell>
                    <TableCell>
                      {e.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">Ativo</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-600">Inativo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right" onClick={(ev) => ev.stopPropagation()}>
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => onInvite(e.id)}>Link</Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(e)}>Editar</Button>
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

      {/* Detail dialog */}
      <Dialog open={!!detailRow} onOpenChange={(o) => !o && setDetailRow(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalhes do Colaborador</DialogTitle></DialogHeader>
          {detailRow && (
            <div className="grid gap-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Nome:</span><div className="font-medium">{detailRow.full_name || "-"}</div></div>
                <div><span className="text-muted-foreground">Identificador:</span><div className="font-mono">{detailRow.identifier}</div></div>
                <div><span className="text-muted-foreground">CPF:</span><div>{detailRow.cpf || "-"}</div></div>
                <div><span className="text-muted-foreground">Email:</span><div>{detailRow.email || "-"}</div></div>
                <div><span className="text-muted-foreground">Telefone:</span><div>{detailRow.phone || "-"}</div></div>
                <div><span className="text-muted-foreground">Cargo:</span><div>{detailRow.job_title || "-"}</div></div>
                <div><span className="text-muted-foreground">Data admissao:</span><div>{detailRow.admission_date ? new Date(detailRow.admission_date).toLocaleDateString("pt-BR") : "-"}</div></div>
                <div><span className="text-muted-foreground">CNPJ:</span><div>{detailRow.cnpj_id ? (cnpjMap.get(detailRow.cnpj_id)?.trade_name || cnpjMap.get(detailRow.cnpj_id)?.legal_name || "-") : "-"}</div></div>
                <div><span className="text-muted-foreground">Setor:</span><div>{detailRow.org_unit_id ? unitMap.get(detailRow.org_unit_id)?.name || "-" : "-"}</div></div>
                <div><span className="text-muted-foreground">Status:</span><div>{detailRow.is_active ? "Ativo" : "Inativo"}</div></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (detailRow) openEdit(detailRow); setDetailRow(null); }}>Editar</Button>
            <Button onClick={() => setDetailRow(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar Colaborador</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Identificador</Label>
              <Input value={editIdentifier} onChange={(e) => setEditIdentifier(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input value={editCpf} onChange={(e) => setEditCpf(e.target.value)} maxLength={14} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Cargo/Funcao</Label>
              <Input value={editJobTitle} onChange={(e) => setEditJobTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Data admissao</Label>
              <Input type="date" value={editAdmissionDate} onChange={(e) => setEditAdmissionDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={editCnpjId} onChange={(e) => setEditCnpjId(e.target.value)}>
                <option value="">(sem)</option>
                {cnpjs.map((c) => <option key={c.id} value={c.id}>{c.trade_name || c.legal_name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Setor/Unidade</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={editOrgUnitId} onChange={(e) => setEditOrgUnitId(e.target.value)}>
                <option value="">(sem)</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="edit-active" checked={editIsActive} onChange={(e) => setEditIsActive(e.target.checked)} className="h-4 w-4" />
              <Label htmlFor="edit-active">Ativo</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={onSaveEdit} disabled={!editIdentifier}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="text-red-600">Excluir Colaborador</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Esta acao e irreversivel. O colaborador sera removido permanentemente.</p>
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

      {/* Import modal */}
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} units={units} onImportComplete={refresh} />
    </div>
  );
}
