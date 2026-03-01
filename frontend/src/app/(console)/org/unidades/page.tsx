"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createUnit, listCnpjs, listUnits, updateUnit } from "@/lib/api/org";
import type { CNPJOut, OrgUnitOut } from "@/lib/api/types";
import { toast } from "sonner";

export default function UnidadesPage() {
  const [cnpjs, setCnpjs] = useState<CNPJOut[]>([]);
  const [selectedCnpj, setSelectedCnpj] = useState<string>("");
  const [units, setUnits] = useState<OrgUnitOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(true);

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

  // Filtra apenas CNPJs ativos para o dropdown
  const activeCnpjs = useMemo(() => cnpjs.filter((c) => c.is_active), [cnpjs]);

  useEffect(() => {
    (async () => {
      try {
        const c = await listCnpjs(false); // Apenas CNPJs ativos
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
      toast.error(e?.message || "Não foi possível alterar o status");
    }
  }

  // Options para parent (exclui a própria unidade em edição)
  const parentOptions = useMemo(() => {
    if (editRow) {
      return units.filter((u) => u.id !== editRow.id && u.is_active);
    }
    return units.filter((u) => u.is_active);
  }, [units, editRow]);

  // Mapa de nomes para exibir parent
  const unitNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of units) {
      map[u.id] = u.name;
    }
    return map;
  }, [units]);

  return (
    <div className="container py-8 space-y-6">
      <PageHeader title="Setores / Unidades" description="Estruture a organização para análise e aplicação setorizadas." />

      <Card>
        <CardHeader>
          <CardTitle>Contexto</CardTitle>
          <CardDescription>Selecione o CNPJ e cadastre setores/unidades.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>CNPJ</Label>
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
                    {c.trade_name || c.legal_name} • {c.cnpj_number}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
            Dica: vincule cada colaborador a um setor (org_unit) para análises e ações segmentadas.
          </div>
        </CardContent>
      </Card>

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
            <Label>Parent (opcional)</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">(sem)</option>
              {parentOptions.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.unit_type})</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-4">
            <Button onClick={onCreate} disabled={!selectedCnpj || !name}>Criar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista</CardTitle>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Parent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : units.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nenhuma unidade cadastrada.</TableCell></TableRow>
              ) : (
                units.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell>{u.unit_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.parent_unit_id ? unitNameMap[u.parent_unit_id] || u.parent_unit_id : "-"}
                    </TableCell>
                    <TableCell>
                      {u.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">Ativo</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-600">Inativo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                          Editar
                        </Button>
                        <Button variant={u.is_active ? "destructive" : "default"} size="sm" onClick={() => openToggle(u)}>
                          {u.is_active ? "Desativar" : "Ativar"}
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
              <Label>Parent (opcional)</Label>
              <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={editParent} onChange={(e) => setEditParent(e.target.value)}>
                <option value="">(sem)</option>
                {parentOptions.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.unit_type})</option>
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
                ? "Ao desativar, esta unidade deixa de ser selecionável em operações. Colaboradores vinculados permanecerão, mas devem ser movidos."
                : "Ao ativar, esta unidade volta a ficar disponível para operações."}
            </p>
            {confirmRow ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div><span className="font-medium">Nome:</span> {confirmRow.name}</div>
                <div><span className="font-medium">Tipo:</span> {confirmRow.unit_type}</div>
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
