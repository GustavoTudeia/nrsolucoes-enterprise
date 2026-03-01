"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConsoleProvider, useConsole } from "@/components/console/console-provider";
import { ConsoleSidebar } from "@/components/console/sidebar";
import { ConsoleTopbar } from "@/components/console/topbar";
import { WhatsAppFab } from "@/components/support/whatsapp-fab";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

import { getMyLegalStatus, acceptLegal } from "@/lib/api/legal";
import type { LegalStatusOut } from "@/lib/api/types";

function ConsoleGate({ children }: { children: React.ReactNode }) {
  const { loading, me } = useConsole();
  const router = useRouter();

  const [legal, setLegal] = useState<LegalStatusOut | null>(null);
  const [legalLoading, setLegalLoading] = useState(false);

  // Redirecionar automaticamente para login se não autenticado
  useEffect(() => {
    if (!loading && !me) {
      router.replace("/login");
    }
  }, [loading, me, router]);

  useEffect(() => {
    (async () => {
      if (!me) return;
      try {
        setLegalLoading(true);
        const st = await getMyLegalStatus();
        setLegal(st);
      } catch {
        // se falhar, não bloqueia (ex: backend antigo)
        setLegal(null);
      } finally {
        setLegalLoading(false);
      }
    })();
  }, [me?.id]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando sessão…</div>;
  }

  if (!me) {
    // Mostra mensagem enquanto redireciona
    return (
      <div className="p-6 text-sm text-muted-foreground">Redirecionando para login…</div>
    );
  }

  // Gate LGPD / Termos (console)
  if (legalLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Validando Termos e Política…</div>;
  }

  if (legal?.is_missing) {
    return (
      <div className="p-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Aceite obrigatório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Para acessar o console, é necessário aceitar os Termos de Uso e a Política de Privacidade vigentes.
            </p>
            <div className="text-sm space-y-1">
              <div>
                <span className="font-medium">Termos:</span> {legal.required.terms_version} —{" "}
                <a className="underline" href={legal.required.terms_url} target="_blank" rel="noreferrer">
                  abrir
                </a>
              </div>
              <div>
                <span className="font-medium">Privacidade:</span> {legal.required.privacy_version} —{" "}
                <a className="underline" href={legal.required.privacy_url} target="_blank" rel="noreferrer">
                  abrir
                </a>
              </div>
            </div>
            <div className="pt-2">
              <Button
                onClick={async () => {
                  await acceptLegal();
                  const st = await getMyLegalStatus();
                  setLegal(st);
                }}
              >
                Aceitar e continuar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleProvider>
      <div className="min-h-screen flex">
        <ConsoleSidebar />
        <div className="flex-1 flex flex-col">
          <ConsoleTopbar />
          <main className="flex-1 bg-gradient-to-b from-muted/30 to-background">
            <ConsoleGate>{children}</ConsoleGate>
          </main>
        </div>
      </div>
      <WhatsAppFab />
    </ConsoleProvider>
  );
}