"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createErgonomicAssessment, listErgonomics, approveErgonomicAssessment, type ErgonomicAssessmentOut } from "@/lib/api/pgr-governance";
import { listCnpjs, listUnits } from "@/lib/api/org";

export default function ErgonomiaPage() {
  const [items, setItems] = useState<ErgonomicAssessmentOut[]>([]);
  const [cnpjs, setCnpjs] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ assessment_type: "AEP", psychosocial_factors: [], findings: [], recommendations: [] });

  async function refresh() {
    setLoading(true);
    try {
      const [assessments, c] = await Promise.all([listErgonomics(), listCnpjs()]);
      setItems(assessments.items);
      setCnpjs(c);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar ergonomia");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    (async () => {
      if (!form.cnpj_id) { setUnits([]); return; }
      try { setUnits(await listUnits(form.cnpj_id)); } catch { setUnits([]); }
    })();
  }, [form.cnpj_id]);

  return <div className="p-6 space-y-6 max-w-[1300px] mx-auto">
    <PageHeader title="AEP / AET" description="Camada ergonômica para NR-17: análise preliminar (AEP), análise ergonômica do trabalho (AET) e rastreabilidade das recomendações." />
    <div className="grid gap-6 lg:grid-cols-[420px,1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Nova avaliação</CardTitle>
          <CardDescription>Registre a avaliação por CNPJ/unidade, tipo, achados e recomendações.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>CNPJ *</Label><Select onValueChange={(v) => setForm((f: any) => ({ ...f, cnpj_id: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{cnpjs.map((c) => <SelectItem key={c.id} value={c.id}>{c.cnpj_number} · {c.legal_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Unidade/Setor</Label><Select onValueChange={(v) => setForm((f: any) => ({ ...f, org_unit_id: v }))}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Tipo</Label><Select value={form.assessment_type} onValueChange={(v) => setForm((f: any) => ({ ...f, assessment_type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="AEP">AEP</SelectItem><SelectItem value="AET">AET</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Título *</Label><Input value={form.title || ""} onChange={(e) => setForm((f: any) => ({ ...f, title: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Processo</Label><Input value={form.process_name || ""} onChange={(e) => setForm((f: any) => ({ ...f, process_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Atividade</Label><Input value={form.activity_name || ""} onChange={(e) => setForm((f: any) => ({ ...f, activity_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Função/Posto</Label><Input value={form.position_name || ""} onChange={(e) => setForm((f: any) => ({ ...f, position_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Posto/Estação</Label><Input value={form.workstation_name || ""} onChange={(e) => setForm((f: any) => ({ ...f, workstation_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Resumo da demanda</Label><Textarea value={form.demand_summary || ""} onChange={(e) => setForm((f: any) => ({ ...f, demand_summary: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Condições observadas</Label><Textarea value={form.conditions_summary || ""} onChange={(e) => setForm((f: any) => ({ ...f, conditions_summary: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Fatores psicossociais relacionados (um por linha)</Label><Textarea value={(form.psychosocial_factors || []).join("\n")} onChange={(e) => setForm((f: any) => ({ ...f, psychosocial_factors: e.target.value.split(/\n+/).map((x: string) => x.trim()).filter(Boolean) }))} /></div>
          <div className="space-y-1"><Label>Achados (um por linha)</Label><Textarea value={(form.findings || []).join("\n")} onChange={(e) => setForm((f: any) => ({ ...f, findings: e.target.value.split(/\n+/).map((x: string) => x.trim()).filter(Boolean) }))} /></div>
          <div className="space-y-1"><Label>Recomendações (uma por linha)</Label><Textarea value={(form.recommendations || []).join("\n")} onChange={(e) => setForm((f: any) => ({ ...f, recommendations: e.target.value.split(/\n+/).map((x: string) => x.trim()).filter(Boolean) }))} /></div>
          <Button disabled={saving || !form.cnpj_id || !form.title?.trim()} onClick={async()=>{ try{ setSaving(true); await createErgonomicAssessment(form); toast.success("Avaliação criada"); setForm({ assessment_type: form.assessment_type || "AEP", psychosocial_factors: [], findings: [], recommendations: [] }); await refresh(); } catch(e:any){ toast.error(e?.message || "Falha ao criar avaliação"); } finally { setSaving(false); } }}>Salvar avaliação</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Avaliações registradas</CardTitle>
          <CardDescription>Use AEP para triagem inicial e AET quando a análise ergonômica exigir aprofundamento.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : <Table><TableHeader><TableRow><TableHead>Tipo</TableHead><TableHead>Título</TableHead><TableHead>Escopo</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell><Badge variant="outline">{item.assessment_type}</Badge></TableCell><TableCell><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground">{item.process_name || "—"} · {item.activity_name || "—"}</div></TableCell><TableCell>{item.position_name || item.workstation_name || "—"}</TableCell><TableCell><Badge variant={item.status === "approved" ? "default" : "outline"}>{item.status}</Badge></TableCell><TableCell className="text-right">{item.status !== "approved" ? <Button size="sm" variant="outline" onClick={async()=>{ await approveErgonomicAssessment(item.id, "Aprovado para execução e monitoramento."); toast.success("Avaliação aprovada"); refresh(); }}>Aprovar</Button> : null}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>
    </div>
  </div>;
}
