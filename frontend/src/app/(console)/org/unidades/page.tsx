"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createUnit, listCnpjs, listUnits, updateUnit } from "@/lib/api/org";
import type { CNPJOut, OrgUnitOut } from "@/lib/api/types";
import { toast } from "sonner";
import { Building2, ChevronRight, Layers, Plus, Users } from "lucide-react";

const TYPE_LABELS: Record<string, string> = {
  sector: "Setor",
  unit: "Unidade",
  department: "Departamento",
};

export default function UnidadesPage() {
  const [cnpjs, setCnpjs] = useState<CNPJOut[]>([]);
  const [selectedCnpj, setSelectedCnpj] = useState<string>("");
  const [units, setUnits] = useState<OrgUnitOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form criar
  const [name, setName] = useState("");
  const [unitType, setUnitType] = useState("sector");
  const [parent, setParent] = useState<string>("");

  // Dialog editar
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<OrgUnitOut | null>(null);
  const [editName, setEditName] = useState("");
  const [editUnitType, setEditUnitType] = useState("");
  const [editParent, setEditParent] = useState("");

  // Dialog confirmar ativar/desativar
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<OrgUnitOut | null>(null);

  const activeCnpjs = useMemo(() => cnpjs.filter((c) => c.is_active), [cnpjs]);
  const selectedCnpjObj = cnpjs.find((c) => c.id === selectedCnpj);

  useEffect(() => {
    (async () => {
      try {
        const c = await listCnpjs(false);
        setCnpjs(c);
        if (c[0]?.id) setSelectedCnpj(c[0].id);
      } catch (e: any) {
        toast.error(e?.message || "Falha ao carregar CNPJs");
      }
    })();
  }, []);

  async function refreshUnits(cnpjId: string) {
    if (!cnpjId) return;
    setLoading(true);
    try {
      const u = await listUnits(cnpjId, showInactive);
      setUnits(u);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar unidades");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCnpj) refreshUnits(selectedCnpj);
  }, [selectedCnpj, showInactive]);

  async function onCreate() {
    try {
      await createUnit({
        cnpj_id: selectedCnpj,
        name,
        unit_type: unitType,
        parent_unit_id: parent || null,
      });
      toast.success("Unidade criada");
      setName("");
      setParent("");
      setShowForm(false);
      refreshUnits(selectedCnpj);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao criar unidade");
    }
  }

  function openEdit(row: OrgUnitOut) {
    setEditRow(row);
    setEditName(row.name);
    setEditUnitType(row.unit_type);
    setEditParent(row.parent_unit_id || "");
    setEditOpen(true);
  }

  async function onSaveEdit() {
    if (!editRow) return;
    try {
      await updateUnit(editRow.id, {
        name: editName,
        unit_type: editUnitType,
        parent_unit_id: editParent || null,
      });
      toast.success("Unidade atualizada");
      setEditOpen(false);
      setEditRow(null);
      refreshUnits(selectedCnpj);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar unidade");
    }
  }

  function openToggle(row: OrgUnitOut) {
    setConfirmRow(row);
    setConfirmOpen(true);
  }

  async function onToggleActive() {
    if (!confirmRow) return;
    try {
      await updateUnit(confirmRow.id, { is_active: !confirmRow.is_active });
      toast.success(confirmRow.is_active ? "Unidade desativada" : "Unidade ativada");
      setConfirmOpen(false);
      setConfirmRow(null);
      refreshUnits(selectedCnpj);
    } catch (e: any) {
      toast.error(e?.message || "Nao foi possivel alterar o status");
    }
  }

  const parentOptions = useMemo(() => {
    if (editRow) {
      return units.filter((u) => u.id !== editRow.id && u.is_active);
    }
    return units.filter((u) => u.is_active);
  }, [units, editRow]);

  // Build tree structure
  const tree = useMemo(() => {
    type TreeNode = OrgUnitOut & { children: TreeNode[]; depth: number };
    const map = new Map<string, TreeNode>();
    for (const u of units) {
      map.set(u.id, { ...u, children: [], depth: 0 });
    }
    const roots: TreeNode[] = [];
    for (const node of map.values()) {
      if (node.parent_unit_id && map.has(node.parent_unit_id)) {
        const parent = map.get(node.parent_unit_id)!;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    // Set depths
    function setDepth(nodes: TreeNode[], d: number) {
      for (const n of nodes) {
        n.depth = d;
        setDepth(n.children, d + 1);
      }
    }
    setDepth(roots, 0);
    // Flatten
    const flat: TreeNode[] = [];
    function flatten(nodes: TreeNode[]) {
      for (const n of nodes) {
        flat.push(n);
        flatten(n.children);
      }
    }
    flatten(roots);
    return flat;
  }, [units]);

  const activeUnits = units.filter((u) => u.is_active).length;
  const totalEmployees = units.reduce((a, u) => a + (u.employee_count || 0), 0);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader title="Setores / Unidades" description="Estruture a organizacao para analise e aplicacao setorizadas." />

      {/* CNPJ selector + summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">CNPJ</CardTitle>
          </CardHeader>
          <CardContent>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={selectedCnpj}
              onChange={(e) => setSelectedCnpj(e.target.value)}
            >
              {activeCnpjs.length === 0 ? (
                <option value="">Nenhum CNPJ ativo</option>
              ) : (
                activeCnpjs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.trade_name || c.legal_name}
                  </option>
                ))
              )}
            </select>
            {selectedCnpjObj && (
              <p className="mt-2 text-xs text-muted-foreground">{selectedCnpjObj.legal_name}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2.5">
                <Layers className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeUnits}</p>
                <p className="text-sm text-muted-foreground">Unidade{activeUnits !== 1 ? "s" : ""} ativa{activeUnits !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2.5">
                <Users className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalEmployees}</p>
                <p className="text-sm text-muted-foreground">Colaborador{totalEmployees !== 1 ? "es" : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* New unit form */}
      {showForm ? (
        <Card>
          <CardHeader><CardTitle>Nova unidade</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Financeiro" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={unitType} onChange={(e) => setUnitType(e.target.value)}>
                <option value="sector">Setor</option>
                <option value="unit">Unidade</option>
                <option value="department">Departamento</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Pertence a (opcional)</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">(raiz)</option>
                {parentOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({TYPE_LABELS[u.unit_type] || u.unit_type})</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-4 flex gap-2">
              <Button onClick={onCreate} disabled={!selectedCnpj || !name}>Criar</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button onClick={() => setShowForm(true)} disabled={!selectedCnpj}>
          <Plus className="h-4 w-4 mr-1" /> Nova Unidade
        </Button>
      )}

      {/* Tree view */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Organograma</CardTitle>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Mostrar inativos
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-8 text-center">Carregando...</p>
          ) : tree.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">Nenhuma unidade cadastrada.</p>
          ) : (
            <div className="space-y-1">
              {tree.map((node) => (
                <div
                  key={node.id}
                  className={`flex items-center justify-between rounded-lg border px-4 py-2.5 transition-colors hover:bg-muted/50 ${!node.is_active ? "opacity-50" : ""}`}
                  style={{ marginLeft: `${node.depth * 1.5}rem` }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {node.depth > 0 && (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <Layers className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    <span className="font-medium truncate">{node.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground flex-shrink-0">
                      {TYPE_LABELS[node.unit_type] || node.unit_type}
                    </span>
                    {!node.is_active && (
                      <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs text-slate-600 flex-shrink-0">Inativo</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      {node.employee_count || 0}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => openEdit(node)}>Editar</Button>
                    <Button variant={node.is_active ? "destructive" : "default"} size="sm" onClick={() => openToggle(node)}>
                      {node.is_active ? "Desativar" : "Ativar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog Editar */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Unidade</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={editUnitType} onChange={(e) => setEditUnitType(e.target.value)}>
                <option value="sector">Setor</option>
                <option value="unit">Unidade</option>
                <option value="department">Departamento</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Pertence a (opcional)</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={editParent} onChange={(e) => setEditParent(e.target.value)}>
                <option value="">(raiz)</option>
                {parentOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({TYPE_LABELS[u.unit_type] || u.unit_type})</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={onSaveEdit} disabled={!editName}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Ativar/Desativar */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmRow?.is_active ? "Desativar Unidade" : "Ativar Unidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              {confirmRow?.is_active
                ? "Ao desativar, esta unidade deixa de ser selecionavel. Colaboradores vinculados permanecerao, mas devem ser movidos."
                : "Ao ativar, esta unidade volta a ficar disponivel para operacoes."}
            </p>
            {confirmRow ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div><span className="font-medium">Nome:</span> {confirmRow.name}</div>
                <div><span className="font-medium">Tipo:</span> {TYPE_LABELS[confirmRow.unit_type] || confirmRow.unit_type}</div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button variant={confirmRow?.is_active ? "destructive" : "default"} onClick={onToggleActive}>
              {confirmRow?.is_active ? "Desativar" : "Ativar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
