"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import { useConsole } from "@/components/console/console-provider";

import { listContents, createContent, createContentUpload, getContentAccess, listAssignments, createAssignment } from "@/lib/api/lms";
import type { ContentOut, LMSAssignmentOut } from "@/lib/api/types";

export default function LMSPage() {
  const { me } = useConsole();
  const isPlatformAdmin = !!me?.is_platform_admin;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);

  const [contents, setContents] = useState<ContentOut[]>([]);
  const [assignments, setAssignments] = useState<LMSAssignmentOut[]>([]);

  // Create link content
  const [title, setTitle] = useState("Política interna");
  const [url, setUrl] = useState("https://example.com");
  const [isOfficial, setIsOfficial] = useState(false);

  // Upload content
  const [uploadTitle, setUploadTitle] = useState("Treinamento NR-1 (vídeo)");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [employeeId, setEmployeeId] = useState<string>("");
  const [orgUnitId, setOrgUnitId] = useState<string>("");

  async function refresh() {
    setLoading(true);
    try {
      const [cs, asg] = await Promise.all([listContents(), listAssignments()]);
      setContents(cs);
      setAssignments(asg.items || []);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onCreateLink() {
    try {
      const c = await createContent({
        title,
        content_type: "link",
        url,
        is_platform_managed: isPlatformAdmin ? isOfficial : false,
      });
      toast({ title: "Conteúdo criado", description: c.title });
      await refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onUpload() {
    if (!uploadFile) {
      toast({ title: "Selecione um arquivo" });
      return;
    }
    try {
      setUploading(true);

      const up = await createContentUpload({
        title: uploadTitle,
        filename: uploadFile.name,
        mime_type: uploadFile.type || "application/octet-stream",
        is_platform_managed: isPlatformAdmin ? isOfficial : false,
      });

      const put = await fetch(up.upload_url, {
        method: "PUT",
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
        body: uploadFile,
      });

      if (!put.ok) {
        const text = await put.text().catch(() => "");
        throw new Error(`Falha no upload (HTTP ${put.status}). ${text}`);
      }

      toast({ title: "Upload concluído" });
      setUploadFile(null);
      await refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    } finally {
      setUploading(false);
    }
  }

  async function onOpenContent(c: ContentOut) {
    try {
      if (c.url) {
        window.open(c.url, "_blank");
        return;
      }
      const acc = await getContentAccess(c.id);
      window.open(acc.access_url, "_blank");
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onAssign(contentItemId: string) {
    try {
      const payload: any = { content_item_id: contentItemId };
      if (employeeId) payload.employee_id = employeeId;
      if (orgUnitId) payload.org_unit_id = orgUnitId;
      if (!employeeId && !orgUnitId) {
        toast({ title: "Informe employee_id ou org_unit_id" });
        return;
      }
      await createAssignment(payload);
      toast({ title: "Atribuição criada" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>LMS</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Conteúdos, uploads e atribuições (NR-1).</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo conteúdo (link)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
          </div>

          {isPlatformAdmin ? (
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
              <span className="text-sm">Marcar como conteúdo oficial</span>
            </div>
          ) : null}

          <Button onClick={onCreateLink} disabled={loading}>
            Criar conteúdo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo conteúdo (upload de vídeo/PDF)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <Input
                type="file"
                accept="video/*,application/pdf"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>

          {isPlatformAdmin ? (
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={isOfficial} onChange={(e) => setIsOfficial(e.target.checked)} />
              <span className="text-sm">Marcar como conteúdo oficial</span>
            </div>
          ) : null}

          <Button onClick={onUpload} disabled={uploading}>
            {uploading ? "Enviando…" : "Enviar"}
          </Button>

          <p className="text-xs text-muted-foreground">
            O upload é direto para o storage (presigned URL). Em ambiente local, certifique-se de que o MinIO está ativo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conteúdos</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Oficial</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contents.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.title}</TableCell>
                  <TableCell>{c.content_type}</TableCell>
                  <TableCell>{c.is_platform_managed ? "sim" : "-"}</TableCell>
                  <TableCell className="space-x-2">
                    <Button variant="outline" size="sm" onClick={() => onOpenContent(c)}>
                      Abrir
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => onAssign(c.id)}>
                      Atribuir
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {contents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Nenhum conteúdo cadastrado.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>employee_id</Label>
              <Input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="UUID" />
            </div>
            <div className="space-y-2">
              <Label>org_unit_id</Label>
              <Input value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} placeholder="UUID" />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Para atribuir: informe um UUID de colaborador ou de unidade/setor.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atribuições</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Progresso</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-mono text-xs">{a.id}</TableCell>
                  <TableCell>{a.status}</TableCell>
                  <TableCell>{a.due_at ? new Date(a.due_at).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>
                    {a.progress_seconds ? `${a.progress_seconds}s` : "0s"}
                    {a.duration_seconds ? ` / ${a.duration_seconds}s` : ""}
                    {a.completed_at ? " (concluído)" : ""}
                  </TableCell>
                </TableRow>
              ))}
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    Nenhuma atribuição.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
