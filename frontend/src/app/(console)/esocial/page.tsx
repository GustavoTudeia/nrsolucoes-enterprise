"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import { listCnpjs, listUnits } from "@/lib/api/org";
import { listEmployees } from "@/lib/api/employees";
import {
  listS2240Profiles,
  createS2240Profile,
  exportS2240Profile,
  listS2210Accidents,
  createS2210Accident,
  exportS2210Accident,
  listS2220Exams,
  createS2220Exam,
  exportS2220Exam,
} from "@/lib/api/esocial";
import type { CNPJOut, OrgUnitOut, EmployeeOut, S2240ProfileOut, S2210AccidentOut, S2220ExamOut } from "@/lib/api/types";

function downloadJson(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ESocialPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);

  const [cnpjs, setCnpjs] = useState<CNPJOut[]>([]);
  const [units, setUnits] = useState<OrgUnitOut[]>([]);
  const [employees, setEmployees] = useState<EmployeeOut[]>([]);

  const [profiles, setProfiles] = useState<S2240ProfileOut[]>([]);
  const [accidents, setAccidents] = useState<S2210AccidentOut[]>([]);
  const [exams, setExams] = useState<S2220ExamOut[]>([]);

  // S-2240 form
  const [cnpjId, setCnpjId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const [roleName, setRoleName] = useState<string>("Operador(a)");
  const [factorsJson, setFactorsJson] = useState<string>(
    JSON.stringify(
      [
        { code: "ERGON", name: "Ergonômico", details: "Postura/repetitividade", intensity: "médio" },
      ],
      null,
      2
    )
  );
  const [controlsJson, setControlsJson] = useState<string>(JSON.stringify({ epc: [], epi: [] }, null, 2));

  // S-2210 form
  const [accEmployeeId, setAccEmployeeId] = useState<string>("");
  const [accType, setAccType] = useState<string>("typical");
  const [accDesc, setAccDesc] = useState<string>("");

  // S-2220 form
  const [examEmployeeId, setExamEmployeeId] = useState<string>("");
  const [examType, setExamType] = useState<string>("periodic");
  const [examResult, setExamResult] = useState<string>("Apto");

  const unitOptions = useMemo(() => {
    const filtered = cnpjId ? units.filter((u) => u.cnpj_id === cnpjId) : units;
    return filtered;
  }, [units, cnpjId]);

  async function refreshAll() {
    try {
      const [c, u, e, p, a, x] = await Promise.all([
        listCnpjs(),
        listUnits(),
        listEmployees(),
        listS2240Profiles(50, 0),
        listS2210Accidents(50, 0),
        listS2220Exams(50, 0),
      ]);
      setCnpjs(c);
      setUnits(u);
      setEmployees(e);
      setProfiles(p.items || []);
      setAccidents(a.items || []);
      setExams(x.items || []);
    } catch (err: any) {
      toast({
        title: "Erro ao carregar eSocial",
        description: err?.detail || err?.message || "Verifique se o plano habilita ESOCIAL_EXPORT.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
  }, []);

  async function onCreateProfile() {
    try {
      if (!cnpjId) throw new Error("Selecione um CNPJ");
      if (!roleName.trim()) throw new Error("Informe a função/cargo");

      let factors: any[] = [];
      let controls: any = {};
      try {
        factors = JSON.parse(factorsJson || "[]");
      } catch {
        throw new Error("JSON inválido em fatores");
      }
      try {
        controls = JSON.parse(controlsJson || "{}");
      } catch {
        throw new Error("JSON inválido em controles");
      }

      await createS2240Profile({
        cnpj_id: cnpjId,
        org_unit_id: unitId ? unitId : null,
        role_name: roleName.trim(),
        factors,
        controls,
        is_active: true,
      });
      toast({ title: "Perfil S-2240 criado" });
      await refreshAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || err?.detail || "" });
    }
  }

  async function onExportProfile(profileId: string) {
    try {
      const exp = await exportS2240Profile(profileId);
      downloadJson(`S-2240_${profileId}.json`, exp);
      toast({ title: "Export gerado", description: "Arquivo JSON baixado." });
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || err?.detail || "" });
    }
  }

  async function onCreateAccident() {
    try {
      if (!accEmployeeId) throw new Error("Selecione um colaborador");
      const r = await createS2210Accident({
        employee_id: accEmployeeId,
        accident_type: accType || null,
        description: accDesc || null,
      });
      toast({ title: "Registro S-2210 criado" });
      await refreshAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || err?.detail || "" });
    }
  }

  async function onExportAccident(accidentId: string) {
    try {
      const exp = await exportS2210Accident(accidentId);
      downloadJson(`S-2210_${accidentId}.json`, exp);
      toast({ title: "Export gerado", description: "Arquivo JSON baixado." });
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || err?.detail || "" });
    }
  }

  async function onCreateExam() {
    try {
      if (!examEmployeeId) throw new Error("Selecione um colaborador");
      await createS2220Exam({
        employee_id: examEmployeeId,
        exam_type: examType || null,
        result: examResult || null,
      });
      toast({ title: "Registro S-2220 criado" });
      await refreshAll();
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || err?.detail || "" });
    }
  }

  async function onExportExam(examId: string) {
    try {
      const exp = await exportS2220Exam(examId);
      downloadJson(`S-2220_${examId}.json`, exp);
      toast({ title: "Export gerado", description: "Arquivo JSON baixado." });
    } catch (err: any) {
      toast({ title: "Erro", description: err?.message || err?.detail || "" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="eSocial SST (assistido)" description="Cadastre bases e exporte JSON para integração (S-2240 / S-2210 / S-2220)." />

      <Tabs defaultValue="s2240">
        <TabsList>
          <TabsTrigger value="s2240">S-2240</TabsTrigger>
          <TabsTrigger value="s2210">S-2210</TabsTrigger>
          <TabsTrigger value="s2220">S-2220</TabsTrigger>
        </TabsList>

        <TabsContent value="s2240" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Criar perfil de exposição (S-2240)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>CNPJ</Label>
                  <select className="w-full border rounded-md h-10 px-3" value={cnpjId} onChange={(e) => setCnpjId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {cnpjs.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.trade_name || c.legal_name} ({c.cnpj_number})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Unidade/Setor (opcional)</Label>
                  <select className="w-full border rounded-md h-10 px-3" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    <option value="">(nenhum)</option>
                    {unitOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label>Função/Cargo</Label>
                <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Fatores (JSON)</Label>
                  <Textarea rows={10} value={factorsJson} onChange={(e) => setFactorsJson(e.target.value)} />
                </div>
                <div>
                  <Label>Controles/Medidas (JSON)</Label>
                  <Textarea rows={10} value={controlsJson} onChange={(e) => setControlsJson(e.target.value)} />
                </div>
              </div>

              <Button onClick={onCreateProfile}>Criar perfil</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Perfis cadastrados</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Função</TableHead>
                    <TableHead>CNPJ</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Fatores</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profiles.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.role_name}</TableCell>
                      <TableCell className="text-xs">{p.cnpj_id}</TableCell>
                      <TableCell className="text-xs">{p.org_unit_id || "-"}</TableCell>
                      <TableCell>{(p.factors || []).length}</TableCell>
                      <TableCell>
                        <Button variant="outline" onClick={() => onExportProfile(p.id)}>
                          Export JSON
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!profiles.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        {loading ? "Carregando..." : "Nenhum perfil ainda."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="s2210" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Criar registro de acidente (S-2210)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Colaborador</Label>
                  <select className="w-full border rounded-md h-10 px-3" value={accEmployeeId} onChange={(e) => setAccEmployeeId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name || e.identifier}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Input value={accType} onChange={(e) => setAccType(e.target.value)} placeholder="typical|commute|occupational_disease" />
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <Textarea value={accDesc} onChange={(e) => setAccDesc(e.target.value)} rows={4} />
              </div>
              <Button onClick={onCreateAccident}>Criar registro</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registros</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>CAT</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accidents.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{a.occurred_at}</TableCell>
                      <TableCell className="text-xs">{a.employee_id}</TableCell>
                      <TableCell>{a.accident_type || "-"}</TableCell>
                      <TableCell>{a.cat_number || "-"}</TableCell>
                      <TableCell>
                        <Button variant="outline" onClick={() => onExportAccident(a.id)}>
                          Export JSON
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!accidents.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        {loading ? "Carregando..." : "Nenhum registro ainda."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="s2220" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Criar registro de exame (S-2220)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Colaborador</Label>
                  <select className="w-full border rounded-md h-10 px-3" value={examEmployeeId} onChange={(e) => setExamEmployeeId(e.target.value)}>
                    <option value="">Selecione...</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.full_name || e.identifier}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Input value={examType} onChange={(e) => setExamType(e.target.value)} placeholder="admission|periodic|return|change|dismissal" />
                </div>
              </div>
              <div>
                <Label>Resultado</Label>
                <Input value={examResult} onChange={(e) => setExamResult(e.target.value)} />
              </div>
              <Button onClick={onCreateExam}>Criar registro</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Registros</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Colaborador</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exams.map((x) => (
                    <TableRow key={x.id}>
                      <TableCell className="text-xs">{x.exam_date}</TableCell>
                      <TableCell className="text-xs">{x.employee_id}</TableCell>
                      <TableCell>{x.exam_type || "-"}</TableCell>
                      <TableCell>{x.result || "-"}</TableCell>
                      <TableCell>
                        <Button variant="outline" onClick={() => onExportExam(x.id)}>
                          Export JSON
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!exams.length ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-sm text-muted-foreground">
                        {loading ? "Carregando..." : "Nenhum registro ainda."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
