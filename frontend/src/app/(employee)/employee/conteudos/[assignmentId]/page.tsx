"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { listEmployeeAssignments, getEmployeeContent, completeAssignment, upsertProgress } from "@/lib/api/employeePortal";
import type { EmployeeAssignmentOut, EmployeeContentOut } from "@/lib/api/types";

function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") && u.searchParams.get("v")) {
      return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
    }
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default function EmployeeContentPage() {
  const params = useParams();
  const assignmentId = String(params.assignmentId);

  const { toast } = useToast();

  const [assignment, setAssignment] = useState<EmployeeAssignmentOut | null>(null);
  const [content, setContent] = useState<EmployeeContentOut | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [lastSentAt, setLastSentAt] = useState<number>(0);

  const isVideo = useMemo(() => (content?.content_type || "") === "video", [content?.content_type]);

  useEffect(() => {
    (async () => {
      try {
        const asg = await listEmployeeAssignments();
        const found = asg.find((a) => a.id === assignmentId) || null;
        setAssignment(found);
        if (!found?.content_item_id) return;

        const c = await getEmployeeContent(found.content_item_id, found.id);
        setContent(c);
      } catch (e: any) {
        toast({ title: "Erro", description: e?.message || "" });
      }
    })();
  }, [assignmentId, toast]);

  async function onComplete() {
    if (!assignment) return;
    try {
      await completeAssignment(assignment.id);
      toast({ title: "Concluído" });
      const asg = await listEmployeeAssignments();
      const found = asg.find((a) => a.id === assignmentId) || null;
      setAssignment(found);
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function pushProgress(positionSeconds: number, durationSeconds: number | null) {
    if (!assignment) return;
    try {
      await upsertProgress({ assignment_id: assignment.id, position_seconds: Math.floor(positionSeconds), duration_seconds: durationSeconds });
    } catch {
      // progress não deve quebrar a UX
    }
  }

  useEffect(() => {
    if (!isVideo) return;
    const v = videoRef.current;
    if (!v) return;

    const onLoaded = () => {
      const startAt = assignment?.progress_seconds || 0;
      if (startAt > 0 && startAt < (v.duration || 0) - 1) {
        v.currentTime = startAt;
      }
    };

    const onTimeUpdate = () => {
      const now = Date.now();
      // throttle: a cada ~10s
      if (now - lastSentAt < 10_000) return;
      setLastSentAt(now);
      pushProgress(v.currentTime, Number.isFinite(v.duration) ? Math.floor(v.duration) : null);
    };

    const onPause = () => {
      pushProgress(v.currentTime, Number.isFinite(v.duration) ? Math.floor(v.duration) : null);
    };

    const onEnded = () => {
      pushProgress(v.currentTime, Number.isFinite(v.duration) ? Math.floor(v.duration) : null);
      // backend pode marcar como concluído automaticamente (watch threshold)
    };

    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);

    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  }, [assignment?.progress_seconds, isVideo, lastSentAt]);

  const embed = content?.url ? youtubeEmbed(content.url) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">Atribuição</div>
          <div className="font-mono text-xs">{assignment?.id || assignmentId}</div>
          <div className="mt-2 text-lg font-semibold">{content?.title || "Conteúdo"}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link className="no-underline" href="/employee/dashboard">
              Dashboard
            </Link>
          </Button>
          {assignment?.status !== "done" && <Button onClick={onComplete}>Concluir</Button>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conteúdo</CardTitle>
          <CardDescription>{content?.description || "—"}</CardDescription>
        </CardHeader>
        <CardContent>
          {!content?.url ? (
            <div className="text-sm text-muted-foreground">Conteúdo sem URL.</div>
          ) : isVideo ? (
            <div className="space-y-2">
              <video ref={videoRef} className="w-full rounded-lg border" controls src={content.url} />
              <div className="text-xs text-muted-foreground">
                Progresso: {assignment?.progress_seconds ? `${assignment.progress_seconds}s` : "0s"}
                {assignment?.duration_seconds ? ` / ${assignment.duration_seconds}s` : ""}
              </div>
            </div>
          ) : embed ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border">
              <iframe
                className="h-full w-full"
                src={embed}
                title="Treinamento"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-muted-foreground">Abrir em nova aba:</div>
              <a className="underline" href={content.url} target="_blank" rel="noreferrer">
                {content.url}
              </a>
            </div>
          )}

          <div className="mt-4 text-xs text-muted-foreground">
            Dica: em enterprise, recomenda-se trilhas com evidências e assinatura de conclusão conforme política interna.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
