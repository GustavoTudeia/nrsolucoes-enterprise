"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getBillingOnboarding } from "@/lib/api/billing";
import type { OnboardingOverviewOut } from "@/lib/api/types";
import { trackBrowserEvent } from "@/lib/analytics/client";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  done: { label: "Concluído", cls: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200" },
  current: { label: "Agora", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" },
  blocked: { label: "Bloqueado", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
};

export default function OnboardingPage() {
  const [data, setData] = useState<OnboardingOverviewOut | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { trackBrowserEvent("console", { event_name: "onboarding_page_viewed", source: "console", module: "onboarding" }); setData(await getBillingOnboarding()); } catch (e: any) { toast.error(e?.message || "Falha ao carregar onboarding"); } finally { setLoading(false); } })(); }, []);
  return <div className="p-6 space-y-6 max-w-[1100px] mx-auto"><PageHeader title="Onboarding" description="Implantação enterprise ponta a ponta: financeiro, estrutura, usuários e primeira evidência." /><Card><CardHeader><CardTitle>Progresso da implantação</CardTitle><CardDescription>A meta é sair do cadastro inicial até a primeira resposta coletada com financeiro e faturamento prontos.</CardDescription></CardHeader><CardContent className="space-y-4">{loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : data ? <><div className="flex items-center justify-between gap-4"><div><div className="text-3xl font-bold">{data.progress_percent}%</div><div className="text-sm text-muted-foreground">Status: {data.status === 'completed' ? 'Concluído' : 'Em andamento'}</div></div><div className="min-w-[240px] flex-1 max-w-md"><Progress value={data.progress_percent} /></div></div><div className="grid gap-3 md:grid-cols-2">{data.steps.map((step) => { const st = STATUS_LABELS[step.status] || STATUS_LABELS.blocked; return <Card key={step.key} className="border-dashed"><CardContent className="pt-5 space-y-3"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{step.title}</div><div className="text-sm text-muted-foreground mt-1">{step.description}</div></div><Badge className={st.cls}>{st.label}</Badge></div><Button asChild size="sm" variant={step.status === 'blocked' ? 'outline' : 'default'}><Link href={step.href}>{step.status === 'done' ? 'Revisar' : 'Abrir'}</Link></Button></CardContent></Card>; })}</div></> : null}</CardContent></Card></div>;
}
