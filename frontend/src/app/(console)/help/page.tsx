"use client";

import Link from "next/link";
import { BookOpen, LifeBuoy, MessageCircle, ShieldCheck } from "lucide-react";

import { useConsole } from "@/components/console/console-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function buildWhatsAppLink(phoneE164Digits: string, text: string) {
  const phone = (phoneE164Digits || "").replace(/\D/g, "");
  const msg = encodeURIComponent(text);
  return `https://wa.me/${phone}?text=${msg}`;
}

export default function HelpPage() {
  const { me } = useConsole();

  const supportPhone = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || "5511999999999";
  const defaultMsg = `Olá! Preciso de suporte na NR Soluções.\n\nUsuário: ${me?.full_name || ""} (${me?.email || ""})\nTenant: ${me?.tenant_id || ""}\n\nDescreva aqui o problema:`;
  const waLink = buildWhatsAppLink(supportPhone, defaultMsg);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Central de Ajuda</h1>
        <p className="text-sm text-muted-foreground">
          Suporte, orientações de uso e boas práticas para operação enterprise.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="whatsapp">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Canal WhatsApp
            </CardTitle>
            <CardDescription>
              Atendimento rápido para incidentes, dúvidas e onboarding.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <a href={waLink} target="_blank" rel="noreferrer">
              <Button className="w-full">Abrir WhatsApp</Button>
            </a>
            <p className="text-xs text-muted-foreground">
              Dica: o link já envia seu usuário e Tenant ID para agilizar o atendimento.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5" />
              Suporte e contato
            </CardTitle>
            <CardDescription>
              Abra uma solicitação, reporte um bug ou peça melhorias.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link href="/contato">
              <Button variant="outline" className="w-full">Fale conosco</Button>
            </Link>
            <Link href="/sobre">
              <Button variant="ghost" className="w-full">Sobre a plataforma</Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Operação recomendada (enterprise)
          </CardTitle>
          <CardDescription>
            Fluxo sugerido para reduzir intervenção humana e manter qualidade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border p-4">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" />
                1) Organização
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Cadastre CNPJs e Unidades. Defina hierarquia e responsáveis.
              </p>
            </div>
            <div className="rounded-md border p-4">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" />
                2) Campanhas e Questionários
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Publique campanhas, colete evidências e acompanhe indicadores.
              </p>
            </div>
            <div className="rounded-md border p-4">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" />
                3) Insights e Ações
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Use relatórios, gere planos de ação e treine via LMS.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
