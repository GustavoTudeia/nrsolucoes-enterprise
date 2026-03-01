"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { useConsole } from "@/components/console/console-provider";
import { Button } from "@/components/ui/button";

export function WhatsAppFab() {
  const { me } = useConsole();

  if (!me) return null;

  const phone = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "5511999999999";
  const baseMsg = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP_MESSAGE ?? "Olá, preciso de suporte na plataforma NR Soluções.";

  const msg = `${baseMsg}\n\nUsuário: ${me.full_name ?? me.email}\nEmail: ${me.email}\nTenant: ${me.tenant_id}`;
  const href = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

  return (
    <div className="fixed bottom-5 right-5 z-50">
      <Button asChild className="rounded-full shadow-lg">
        <Link href={href} target="_blank" rel="noreferrer" aria-label="Abrir suporte via WhatsApp">
          <MessageCircle className="h-5 w-5 mr-2" />
          WhatsApp
        </Link>
      </Button>
    </div>
  );
}
