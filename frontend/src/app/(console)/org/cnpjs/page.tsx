"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/console/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCnpj, listCnpjs, updateCnpj } from "@/lib/api/org";
import type { CNPJOut } from "@/lib/api/types";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function onlyDigits(v: string) {
  return (v || "").replace(/\D/g, "");
}

function isValidCnpj(raw: string) {
  const cnpj = onlyDigits(raw);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (base: string) => {
    const weights = base.length === 12
      ? [5,4,3,2,9,8,7,6,5,4,3,2]
      : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(base[i]) * weights[i];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calc(cnpj.slice(0, 12));
  const d2 = calc(cnpj.slice(0, 12) + String(d1));
  return cnpj === cnpj.slice(0, 12) + String(d1) + String(d2);
}

export default function CnpjsPage() {
  const [rows, setRows] = useState<CNPJOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(true); // Mostrar inativos por padrão
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [cnpjNumber, setCnpjNumber] = useState("");
  const cnpjDigits = onlyDigits(cnpjNumber);
  const cnpjIsValid = cnpjDigits.length === 0 ? false : isValidCnpj(cnpjDigits);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<CNPJOut | null>(null);
  const [editLegalName, setEditLegalName] = useState("");
  const [editTradeName, setEditTradeName] = useState("");
  const [editCnpjNumber, setEditCnpjNumber] = useState("");
  const editDigits = onlyDigits(editCnpjNumber);
  const editCnpjValid = editDigits.length === 0 ? false : isValidCnpj(editDigits);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmRow, setConfirmRow] = useState<CNPJOut | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const r = await listCnpjs(showInactive);
      setRows(r);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar CNPJs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [showInactive]);

  async function onCreate() {
    try {
      await createCnpj({ legal_name: legalName, trade_name: tradeName || undefined, cnpj_number: cnpjDigits });
      toast.success("CNPJ cadastrado");
      setLegalName("");
      setTradeName("");
      setCnpjNumber("");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao cadastrar CNPJ");
    }
  }

  function openEdit(r: CNPJOut) {
    setEditRow(r);
    setEditLegalName(r.legal_name);
    setEditTradeName(r.trade_name || "");
    setEditCnpjNumber(r.cnpj_number);
    setEditOpen(true);
  }

  async function onSaveEdit() {
    if (!editRow) return;
    try {
      await updateCnpj(editRow.id, {
        legal_name: editLegalName,
        trade_name: editTradeName ? editTradeName : null,
        cnpj_number: editDigits,
      });
      toast.success("CNPJ atualizado");
      setEditOpen(false);
      setEditRow(null);
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao atualizar CNPJ");
    }
  }

  function openToggle(r: CNPJOut) {
    setConfirmRow(r);
    setConfirmOpen(true);
  }

  async function onToggleActive() {
    if (!confirmRow) return;
    try {
      await updateCnpj(confirmRow.id, { is_active: !confirmRow.is_active });
      toast.success(confirmRow.is_active ? "CNPJ desabilitado" : "CNPJ habilitado");
      setConfirmOpen(false);
      setConfirmRow(null);
      refresh();
    } catch (e: any) {
      // Backend pode retornar 409 quando existir dependência ativa.
      toast.error(e?.message || "Não foi possível alterar o status do CNPJ");
    }
  }

  // (sem duplicidade): edição e mudança de status são feitas via dialogs.

  return (
    <div className="container py-8 space-y-6">
      <PageHeader title="CNPJs" description="Cadastro multi-CNPJ do tenant." />

      <Card>
        <CardHeader><CardTitle>Novo CNPJ</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Razão social</Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Empresa X LTDA" />
          </div>
          <div className="space-y-2">
            <Label>Nome fantasia</Label>
            <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="Empresa X" />
          </div>
          <div className="space-y-2">
            <Label>CNPJ</Label>
            <Input value={cnpjNumber} onChange={(e) => setCnpjNumber(onlyDigits(e.target.value))} placeholder="00000000000191" />
            {cnpjNumber && !cnpjIsValid ? (
              <p className="text-xs text-red-600">CNPJ inválido (verifique os dígitos)</p>
            ) : (
              <p className="text-xs text-muted-foreground">Digite 14 dígitos (sem máscara). Ex: 00000000000191</p>
            )}
          </div>
          <div className="md:col-span-3">
            <Button onClick={onCreate} disabled={!legalName || !cnpjIsValid}>Cadastrar</Button>
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
                <TableHead>Razão social</TableHead>
                <TableHead>Fantasia</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Carregando…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-muted-foreground">Nenhum CNPJ cadastrado.</TableCell></TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.legal_name}</TableCell>
                    <TableCell>{r.trade_name || "-"}</TableCell>
                    <TableCell>{r.cnpj_number}</TableCell>
                    <TableCell>
                      {r.is_active ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700">Ativo</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2 py-0.5 text-xs font-medium text-slate-600">Inativo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                          Editar
                        </Button>
                        <Button variant={r.is_active ? "destructive" : "default"} size="sm" onClick={() => openToggle(r)}>
                          {r.is_active ? "Desativar" : "Ativar"}
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

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar CNPJ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Razão social</Label>
              <Input value={editLegalName} onChange={(e) => setEditLegalName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nome fantasia</Label>
              <Input value={editTradeName} onChange={(e) => setEditTradeName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={editCnpjNumber} onChange={(e) => setEditCnpjNumber(onlyDigits(e.target.value))} />
              {editCnpjNumber && !editCnpjValid ? (
                <p className="text-xs text-red-600">CNPJ inválido (verifique os dígitos)</p>
              ) : (
                <p className="text-xs text-muted-foreground">Manter 14 dígitos (sem máscara).</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={onSaveEdit} disabled={!editLegalName || !editCnpjValid}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmRow?.is_active ? "Desativar CNPJ" : "Ativar CNPJ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm">
              {confirmRow?.is_active
                ? "Ao desativar, este CNPJ deixa de ser selecionável em operações do tenant. Recomendação: desative primeiro unidades/setores vinculados se ainda estiverem em uso."
                : "Ao ativar, este CNPJ volta a ficar disponível para operações."}
            </p>
            {confirmRow ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm">
                <div><span className="font-medium">Razão social:</span> {confirmRow.legal_name}</div>
                <div><span className="font-medium">CNPJ:</span> {confirmRow.cnpj_number}</div>
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
