"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { employeeMe, listEmployeeAssignments, getEmployeeContent, completeAssignment } from "@/lib/api/employeePortal";
import type { EmployeeAssignmentOut, EmployeeContentOut } from "@/lib/api/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { employeeLogout } from "@/lib/api/auth";

export default function EmployeeDashboard() {
  const [me, setMe] = useState<any>(null);
  const [assignments, setAssignments] = useState<EmployeeAssignmentOut[]>([]);
  const [contents, setContents] = useState<Record<string, EmployeeContentOut>>({});
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [m, a] = await Promise.all([employeeMe(), listEmployeeAssignments()]);
      setMe(m);
      setAssignments(a);

      // hydrate content details
      const ids = Array.from(new Set(a.map((x) => x.content_item_id).filter(Boolean))) as string[];
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const asg = a.find((x) => x.content_item_id === id);
            const c = await getEmployeeContent(id, asg?.id);
            return [id, c] as const;
          } catch {
            return [id, null] as const;
          }
        })
      );
      const map: Record<string, EmployeeContentOut> = {};
      for (const [id, c] of entries) if (c) map[id] = c;
      setContents(map);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao carregar portal");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const pending = useMemo(() => assignments.filter((a) => a.status !== "done"), [assignments]);

  async function onComplete(id: string) {
    try {
      await completeAssignment(id);
      toast.success("Concluído");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao concluir");
    }
  }

  async function logout() {
    await employeeLogout();
    window.location.href = "/";
  }

  return (
    <div className="container py-10 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Minhas atividades</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Portal do colaborador • Treinamentos e confirmações de conclusão.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={logout}>Sair</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>Informações básicas</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {loading ? "Carregando…" : (
            <div className="grid gap-2">
              <div><span className="font-medium text-foreground">Identificador:</span> {me?.identifier || "-"}</div>
              <div><span className="font-medium text-foreground">Nome:</span> {me?.full_name || "-"}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atribuições</CardTitle>
          <CardDescription>Itens pendentes: {pending.length}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : assignments.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma atribuição no momento.</div>
          ) : (
            assignments.map((a) => {
              const c = a.content_item_id ? contents[a.content_item_id] : null;
              const title = c?.title || (a.content_item_id ? `Conteúdo ${a.content_item_id}` : "Trilha");
              const status = a.status;
              const badgeVariant = status === "done" ? "accent" : status === "in_progress" ? "secondary" : "outline";
              return (
                <div key={a.id} className="rounded-lg border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-medium">{title}</div>
                      <Badge variant={badgeVariant as any}>{status}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">Assignment: {a.id}</div>
                    {a.due_at ? <div className="mt-1 text-xs text-muted-foreground">Até: {a.due_at}</div> : null}
                    <div className="mt-1 text-xs text-muted-foreground">Progresso: {a.progress_seconds ? `${a.progress_seconds}s` : "0s"}{a.duration_seconds ? ` / ${a.duration_seconds}s` : ""}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" asChild>
                      <Link className="no-underline" href={`/employee/conteudos/${a.id}`}>Abrir</Link>
                    </Button>
                    {status !== "done" && (
                      <Button onClick={() => onComplete(a.id)}>Concluir</Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-muted/20 p-5 text-xs text-muted-foreground">
        Importante: este portal é para medidas educativas (LMS) e comprovação de conclusão. Para diagnóstico psicossocial, recomenda-se fluxo específico
        com anonimização e sem PII. (O backend atual oferece submissão anônima via /campaigns/{'{id}'}/responses.)
      </div>
    </div>
  );
}
