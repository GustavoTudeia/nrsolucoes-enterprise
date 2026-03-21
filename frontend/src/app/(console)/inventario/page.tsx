"use client";

import { useEffect, useMemo, useState } from "react";
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
import { createInventoryItem, listHazardLibrary, listInventoryItems, approveInventoryItem, type HazardCatalogItemOut, type RiskInventoryItemOut } from "@/lib/api/inventory";
import { createPgrApproval, listPgrApprovals, type PGRDocumentApprovalOut } from "@/lib/api/pgr-governance";
import { listCnpjs, listUnits } from "@/lib/api/org";

const GROUPS = [
  { value: "physical", label: "Físicos" },
  { value: "chemical", label: "Químicos" },
  { value: "biological", label: "Biológicos" },
  { value: "ergonomic", label: "Ergonômicos" },
  { value: "accident", label: "Acidentes/Mecânicos" },
  { value: "psychosocial", label: "Psicossociais" },
];

export default function InventarioPage() {
  const [items, setItems] = useState<RiskInventoryItemOut[]>([]);
  const [library, setLibrary] = useState<HazardCatalogItemOut[]>([]);
  const [cnpjs, setCnpjs] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approvals, setApprovals] = useState<PGRDocumentApprovalOut[]>([]);
  const [approvalForm, setApprovalForm] = useState<any>({ document_scope: "inventory" });
  const [form, setForm] = useState<any>({ hazard_group: "ergonomic", severity: 3, probability: 3, existing_controls: [], proposed_controls: [], evidence_requirements: [] });

  async function refresh() {
    setLoading(true);
    try {
      const [lib, inv, c, ap] = await Promise.all([listHazardLibrary(), listInventoryItems(), listCnpjs(), listPgrApprovals()]);
      setLibrary(lib.items);
      setItems(inv.items);
      setCnpjs(c);
      setApprovals(ap.items);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar inventário");
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

  const filteredLibrary = useMemo(() => library.filter((x) => x.hazard_group === form.hazard_group), [library, form.hazard_group]);

  return <div className="p-6 space-y-6 max-w-[1200px] mx-auto">
    <PageHeader title="Inventário NR-1" description="Cadastro vivo de perigos, fontes, danos, controles, risco residual e aprovação do inventário do PGR." />
    <div className="grid gap-6 lg:grid-cols-[420px,1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Novo item do inventário</CardTitle>
          <CardDescription>Use a biblioteca oficial como ponto de partida e ajuste para a realidade da operação.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1"><Label>CNPJ *</Label><Select onValueChange={(v) => setForm((f: any) => ({ ...f, cnpj_id: v }))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{cnpjs.map((c) => <SelectItem key={c.id} value={c.id}>{c.cnpj_number} · {c.legal_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Unidade/Setor</Label><Select onValueChange={(v) => setForm((f: any) => ({ ...f, org_unit_id: v }))}><SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger><SelectContent>{units.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Grupo de perigo</Label><Select value={form.hazard_group} onValueChange={(v) => setForm((f: any) => ({ ...f, hazard_group: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{GROUPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Biblioteca</Label><Select onValueChange={(id) => { const sel = filteredLibrary.find((x) => x.id === id); if (!sel) return; setForm((f: any) => ({ ...f, catalog_item_id: sel.id, hazard_name: sel.name, evidence_requirements: sel.default_evidence_requirements, proposed_controls: sel.control_suggestions })); }}><SelectTrigger><SelectValue placeholder="Selecionar item oficial" /></SelectTrigger><SelectContent>{filteredLibrary.map((h) => <SelectItem key={h.id} value={h.id}>{h.code} · {h.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Processo *</Label><Input value={form.process_name || ""} onChange={(e) => setForm((f: any) => ({ ...f, process_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Atividade *</Label><Input value={form.activity_name || ""} onChange={(e) => setForm((f: any) => ({ ...f, activity_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Função/Posto</Label><Input value={form.position_name || ""} onChange={(e) => setForm((f: any) => ({ ...f, position_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Perigo/Risco *</Label><Input value={form.hazard_name || ""} onChange={(e) => setForm((f: any) => ({ ...f, hazard_name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Fonte/Circunstância</Label><Textarea value={form.source_or_circumstance || ""} onChange={(e) => setForm((f: any) => ({ ...f, source_or_circumstance: e.target.value }))} /></div>
          <div className="space-y-1"><Label>Dano possível</Label><Textarea value={form.possible_damage || ""} onChange={(e) => setForm((f: any) => ({ ...f, possible_damage: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Severidade (1-5)</Label><Input type="number" min={1} max={5} value={form.severity || 3} onChange={(e) => setForm((f: any) => ({ ...f, severity: Number(e.target.value) }))} /></div>
            <div className="space-y-1"><Label>Probabilidade (1-5)</Label><Input type="number" min={1} max={5} value={form.probability || 3} onChange={(e) => setForm((f: any) => ({ ...f, probability: Number(e.target.value) }))} /></div>
          </div>
          <div className="space-y-1"><Label>Controles existentes (um por linha)</Label><Textarea value={(form.existing_controls || []).join("\n")} onChange={(e) => setForm((f: any) => ({ ...f, existing_controls: e.target.value.split(/\n+/).map((x: string) => x.trim()).filter(Boolean) }))} /></div>
          <div className="space-y-1"><Label>Controles propostos (um por linha)</Label><Textarea value={(form.proposed_controls || []).join("\n")} onChange={(e) => setForm((f: any) => ({ ...f, proposed_controls: e.target.value.split(/\n+/).map((x: string) => x.trim()).filter(Boolean) }))} /></div>
          <div className="space-y-1"><Label>Evidências requeridas (uma por linha)</Label><Textarea value={(form.evidence_requirements || []).join("\n")} onChange={(e) => setForm((f: any) => ({ ...f, evidence_requirements: e.target.value.split(/\n+/).map((x: string) => x.trim()).filter(Boolean) }))} /></div>
          <Button disabled={saving || !form.cnpj_id || !form.process_name?.trim() || !form.activity_name?.trim() || !form.hazard_name?.trim()} onClick={async () => { try { setSaving(true); await createInventoryItem(form); toast.success("Item criado"); setForm({ hazard_group: form.hazard_group, severity: 3, probability: 3, existing_controls: [], proposed_controls: [], evidence_requirements: [] }); await refresh(); } catch (e: any) { toast.error(e?.message || "Falha ao criar item"); } finally { setSaving(false); } }}>Salvar item</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Itens do inventário</CardTitle>
          <CardDescription>Risco inerente, residual e aprovação do inventário formal do PGR.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : <Table><TableHeader><TableRow><TableHead>Grupo</TableHead><TableHead>Perigo</TableHead><TableHead>Processo/Atividade</TableHead><TableHead>Risco</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell>{item.hazard_group}</TableCell><TableCell><div className="font-medium">{item.hazard_name}</div><div className="text-xs text-muted-foreground">{item.possible_damage || "—"}</div></TableCell><TableCell>{item.process_name}<div className="text-xs text-muted-foreground">{item.activity_name}</div></TableCell><TableCell><Badge variant="outline">{item.risk_level} · {item.risk_score}</Badge></TableCell><TableCell><Badge variant={item.status === "approved" ? "default" : "outline"}>{item.status}</Badge></TableCell><TableCell className="text-right">{item.status !== "approved" ? <Button size="sm" variant="outline" onClick={async()=>{ await approveInventoryItem(item.id, "Aprovado pelo gestor responsável."); toast.success("Item aprovado"); refresh(); }}>Aprovar</Button> : null}</TableCell></TableRow>)}</TableBody></Table>}
        </CardContent>
      </Card>
    </div>
    <Card>
      <CardHeader>
        <CardTitle>Formalização do inventário / PGR</CardTitle>
        <CardDescription>Congele uma versão aprovada do inventário com hash, responsável, data de vigência e próxima revisão.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[360px,1fr]">
        <div className="space-y-3">
          <div className="space-y-1"><Label>CNPJ</Label><Select onValueChange={(v)=>setApprovalForm((f:any)=>({...f,cnpj_id:v}))}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{cnpjs.map((c) => <SelectItem key={c.id} value={c.id}>{c.cnpj_number} · {c.legal_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Escopo</Label><Select value={approvalForm.document_scope || "inventory"} onValueChange={(v)=>setApprovalForm((f:any)=>({...f,document_scope:v}))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inventory">Inventário</SelectItem><SelectItem value="pgr">PGR</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Versão</Label><Input value={approvalForm.version_label || ""} onChange={(e)=>setApprovalForm((f:any)=>({...f,version_label:e.target.value}))} placeholder="Ex.: PGR-2026.03" /></div>
          <div className="space-y-1"><Label>Observações</Label><Textarea value={approvalForm.notes || ""} onChange={(e)=>setApprovalForm((f:any)=>({...f,notes:e.target.value}))} placeholder="Escopo, premissas e pendências controladas" /></div>
          <Button disabled={!approvalForm.cnpj_id} onClick={async()=>{ try { await createPgrApproval(approvalForm); toast.success("Versão formal criada"); setApprovalForm({ document_scope: approvalForm.document_scope || "inventory" }); await refresh(); } catch(e:any){ toast.error(e?.message || "Falha ao formalizar versão"); } }}>Formalizar versão</Button>
        </div>
        <div>{approvals.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma versão formal registrada ainda.</div> : <Table><TableHeader><TableRow><TableHead>Versão</TableHead><TableHead>Escopo</TableHead><TableHead>Itens</TableHead><TableHead>Hash</TableHead><TableHead>Vigência</TableHead></TableRow></TableHeader><TableBody>{approvals.map((ap)=><TableRow key={ap.id}><TableCell><div className="font-medium">{ap.version_label}</div><div className="text-xs text-muted-foreground">{ap.approver_name}</div></TableCell><TableCell><Badge variant="outline">{ap.document_scope}</Badge></TableCell><TableCell>{ap.inventory_item_count}</TableCell><TableCell className="font-mono text-xs">{ap.snapshot_hash.slice(0,16)}…</TableCell><TableCell>{new Date(ap.approved_at).toLocaleDateString("pt-BR")}</TableCell></TableRow>)}</TableBody></Table>}</div>
      </CardContent>
    </Card>
  </div>;
}
