"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

import { listCnpjs, listUnits } from "@/lib/api/org";
import { listEmployees } from "@/lib/api/employees";
import {
  listS2240Profiles, createS2240Profile, exportS2240Profile,
  listS2210Accidents, createS2210Accident, exportS2210Accident,
  listS2220Exams, createS2220Exam, exportS2220Exam,
} from "@/lib/api/esocial";
import type { CNPJOut, OrgUnitOut, EmployeeOut, S2240ProfileOut, S2210AccidentOut, S2220ExamOut } from "@/lib/api/types";
import {
  AlertTriangle, ClipboardList, Download, FileJson, HeartPulse,
  ShieldAlert, Stethoscope, Users,
} from "lucide-react";

const ACCIDENT_TYPES: Record<string, string> = {
  typical: "Tipico",
  commute: "Trajeto",
  occupational_disease: "Doenca ocupacional",
};

const EXAM_TYPES: Record<string, string> = {
  admission: "Admissional",
  periodic: "Periodico",
  return: "Retorno ao trabalho",
  change: "Mudanca de funcao",
  dismissal: "Demissional",
};

function downloadJson(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ESocialPage() {
  const [loading, setLoading] = useState(true);

  const [cnpjs, setCnpjs] = useState<CNPJOut[]>([]);
  const [units, setUnits] = useState<OrgUnitOut[]>([]);
  const [employees, setEmployees] = useState<EmployeeOut[]>([]);

  const [profiles, setProfiles] = useState<S2240ProfileOut[]>([]);
  const [accidents, setAccidents] = useState<S2210AccidentOut[]>([]);
  const [exams, setExams] = useState<S2220ExamOut[]>([]);

  // Lookup maps
  const cnpjMap = useMemo(() => new Map(cnpjs.map((c) => [c.id, c])), [cnpjs]);
  const unitMap = useMemo(() => new Map(units.map((u) => [u.id, u])), [units]);
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // S-2240 form
  const [cnpjId, setCnpjId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [roleName, setRoleName] = useState("Operador(a)");
  const [factorsJson, setFactorsJson] = useState(
    JSON.stringify([{ code: "ERGON", name: "Ergonomico", details: "Postura/repetitividade", intensity: "medio" }], null, 2)
  );
  const [controlsJson, setControlsJson] = useState(JSON.stringify({ epc: [], epi: [] }, null, 2));

  // S-2210 form
  const [accEmployeeId, setAccEmployeeId] = useState("");
  const [accType, setAccType] = useState("typical");
  const [accDesc, setAccDesc] = useState("");

  // S-2220 form
  const [examEmployeeId, setExamEmployeeId] = useState("");
  const [examType, setExamType] = useState("periodic");
  const [examResult, setExamResult] = useState("Apto");

  const unitOptions = useMemo(() => (cnpjId ? units.filter((u) => u.cnpj_id === cnpjId) : units), [units, cnpjId]);

  async function refreshAll() {
    try {
      const [c, u, e, p, a, x] = await Promise.all([
        listCnpjs(), listUnits(), listEmployees(),
        listS2240Profiles(50, 0), listS2210Accidents(50, 0), listS2220Exams(50, 0),
      ]);
      setCnpjs(c); setUnits(u); setEmployees(e);
      setProfiles(p.items || []); setAccidents(a.items || []); setExams(x.items || []);
    } catch (err: any) {
      toast.error(err?.detail || err?.message || "Erro ao carregar eSocial. Verifique se o plano habilita ESOCIAL_EXPORT.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshAll(); }, []);

  // S-2240 actions
  async function onCreateProfile() {
    try {
      if (!cnpjId) throw new Error("Selecione um CNPJ");
      if (!roleName.trim()) throw new Error("Informe a funcao/cargo");
      let factors: any[], controls: any;
      try { factors = JSON.parse(factorsJson || "[]"); } catch { throw new Error("JSON invalido em fatores"); }
      try { controls = JSON.parse(controlsJson || "{}"); } catch { throw new Error("JSON invalido em controles"); }
      await createS2240Profile({ cnpj_id: cnpjId, org_unit_id: unitId || null, role_name: roleName.trim(), factors, controls, is_active: true });
      toast.success("Perfil S-2240 criado");
      refreshAll();
    } catch (err: any) { toast.error(err?.message || "Erro"); }
  }

  async function onExportProfile(id: string) {
    try {
      const exp = await exportS2240Profile(id);
      downloadJson(`S-2240_${id.slice(0, 8)}.json`, exp);
      toast.success("JSON exportado");
    } catch (err: any) { toast.error(err?.message || "Erro"); }
  }

  // S-2210 actions
  async function onCreateAccident() {
    try {
      if (!accEmployeeId) throw new Error("Selecione um colaborador");
      await createS2210Accident({ employee_id: accEmployeeId, accident_type: accType || null, description: accDesc || null });
      toast.success("Registro S-2210 criado");
      refreshAll();
    } catch (err: any) { toast.error(err?.message || "Erro"); }
  }

  async function onExportAccident(id: string) {
    try {
      const exp = await exportS2210Accident(id);
      downloadJson(`S-2210_${id.slice(0, 8)}.json`, exp);
      toast.success("JSON exportado");
    } catch (err: any) { toast.error(err?.message || "Erro"); }
  }

  // S-2220 actions
  async function onCreateExam() {
    try {
      if (!examEmployeeId) throw new Error("Selecione um colaborador");
      await createS2220Exam({ employee_id: examEmployeeId, exam_type: examType || null, result: examResult || null });
      toast.success("Registro S-2220 criado");
      refreshAll();
    } catch (err: any) { toast.error(err?.message || "Erro"); }
  }

  async function onExportExam(id: string) {
    try {
      const exp = await exportS2220Exam(id);
      downloadJson(`S-2220_${id.slice(0, 8)}.json`, exp);
      toast.success("JSON exportado");
    } catch (err: any) { toast.error(err?.message || "Erro"); }
  }

  function empName(id: string) {
    const e = empMap.get(id);
    return e ? (e.full_name || e.identifier) : id.slice(0, 8) + "...";
  }

  function cnpjLabel(id: string) {
    const c = cnpjMap.get(id);
    return c ? (c.trade_name || c.legal_name) : id.slice(0, 8) + "...";
  }

  function unitName(id: string | null | undefined) {
    if (!id) return "-";
    const u = unitMap.get(id);
    return u ? u.name : "-";
  }

  return (
    <div className="container py-8 space-y-6">
      <PageHeader title="eSocial SST (assistido)" description="Cadastre perfis, acidentes e exames para exportacao JSON (S-2240 / S-2210 / S-2220)." />

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2.5"><ClipboardList className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold">{profiles.length}</p>
                <p className="text-sm text-muted-foreground">Perfis S-2240</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-red-100 p-2.5"><ShieldAlert className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-2xl font-bold">{accidents.length}</p>
                <p className="text-sm text-muted-foreground">Acidentes S-2210</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 p-2.5"><Stethoscope className="h-5 w-5 text-emerald-600" /></div>
              <div>
                <p className="text-2xl font-bold">{exams.length}</p>
                <p className="text-sm text-muted-foreground">Exames S-2220</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="s2240">
        <TabsList>
          <TabsTrigger value="s2240">S-2240 Exposicao</TabsTrigger>
          <TabsTrigger value="s2210">S-2210 Acidentes</TabsTrigger>
          <TabsTrigger value="s2220">S-2220 Exames</TabsTrigger>
        </TabsList>

        {/* ===================== S-2240 ===================== */}
        <TabsContent value="s2240" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Novo perfil de exposicao</CardTitle>
              <CardDescription>Condicoes ambientais de trabalho — fatores de risco e controles (EPC/EPI).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={cnpjId} onChange={(e) => setCnpjId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {cnpjs.map((c) => <option key={c.id} value={c.id}>{c.trade_name || c.legal_name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Setor (opcional)</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    <option value="">(nenhum)</option>
                    {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Funcao/Cargo</Label>
                  <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fatores de risco (JSON)</Label>
                  <Textarea rows={8} value={factorsJson} onChange={(e) => setFactorsJson(e.target.value)} className="font-mono text-xs" />
                </div>
                <div className="space-y-2">
                  <Label>Controles/Medidas (JSON)</Label>
                  <Textarea rows={8} value={controlsJson} onChange={(e) => setControlsJson(e.target.value)} className="font-mono text-xs" />
                </div>
              </div>
              <Button onClick={onCreateProfile} disabled={!cnpjId || !roleName}>Criar perfil</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Perfis cadastrados</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcao</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Setor</TableHead>
                    <TableHead className="text-center">Fatores</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-muted-foreground">{loading ? "Carregando..." : "Nenhum perfil."}</TableCell></TableRow>
                  ) : profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.role_name}</TableCell>
                      <TableCell className="text-sm">{cnpjLabel(p.cnpj_id)}</TableCell>
                      <TableCell className="text-sm">{unitName(p.org_unit_id)}</TableCell>
                      <TableCell className="text-center">{(p.factors || []).length}</TableCell>
                      <TableCell>
                        {p.is_active ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">Ativo</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-600">Inativo</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => onExportProfile(p.id)}>
                          <FileJson className="h-3.5 w-3.5 mr-1" /> Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== S-2210 ===================== */}
        <TabsContent value="s2210" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Registrar acidente / doenca</CardTitle>
              <CardDescription>Registros internos para suporte a CAT e evento S-2210.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Colaborador</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={accEmployeeId} onChange={(e) => setAccEmployeeId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.identifier}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={accType} onChange={(e) => setAccType(e.target.value)}>
                    {Object.entries(ACCIDENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label>Descricao</Label>
                  <Textarea value={accDesc} onChange={(e) => setAccDesc(e.target.value)} rows={2} />
                </div>
              </div>
              <Button onClick={onCreateAccident} disabled={!accEmployeeId}>Registrar</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Registros de acidentes</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>CAT</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accidents.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-muted-foreground">{loading ? "Carregando..." : "Nenhum registro."}</TableCell></TableRow>
                  ) : accidents.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm">{new Date(a.occurred_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="font-medium">{empName(a.employee_id)}</TableCell>
                      <TableCell>{ACCIDENT_TYPES[a.accident_type || ""] || a.accident_type || "-"}</TableCell>
                      <TableCell>{a.cat_number || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => onExportAccident(a.id)}>
                          <FileJson className="h-3.5 w-3.5 mr-1" /> Export
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===================== S-2220 ===================== */}
        <TabsContent value="s2220" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Registrar exame</CardTitle>
              <CardDescription>Monitoramento da saude do trabalhador — ASO e exames complementares.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Colaborador</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={examEmployeeId} onChange={(e) => setExamEmployeeId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name || e.identifier}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={examType} onChange={(e) => setExamType(e.target.value)}>
                    {Object.entries(EXAM_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Resultado</Label>
                  <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={examResult} onChange={(e) => setExamResult(e.target.value)}>
                    <option value="Apto">Apto</option>
                    <option value="Inapto">Inapto</option>
                    <option value="Apto com restricao">Apto com restricao</option>
                  </select>
                </div>
              </div>
              <Button onClick={onCreateExam} disabled={!examEmployeeId}>Registrar</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Registros de exames</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-muted-foreground">{loading ? "Carregando..." : "Nenhum registro."}</TableCell></TableRow>
                  ) : exams.map((x) => {
                    const resultColor = x.result === "Apto" ? "text-emerald-700 bg-emerald-500/10" :
                      x.result === "Inapto" ? "text-red-700 bg-red-500/10" : "text-amber-700 bg-amber-500/10";
                    return (
                      <TableRow key={x.id}>
                        <TableCell className="text-sm">{new Date(x.exam_date).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="font-medium">{empName(x.employee_id)}</TableCell>
                        <TableCell>{EXAM_TYPES[x.exam_type || ""] || x.exam_type || "-"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${resultColor}`}>
                            {x.result || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => onExportExam(x.id)}>
                            <FileJson className="h-3.5 w-3.5 mr-1" /> Export
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
