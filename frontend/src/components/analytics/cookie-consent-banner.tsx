"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getConsent, setConsent } from "@/lib/analytics/client";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(!getConsent());
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <Card className="max-w-3xl p-4 shadow-lg border bg-background/95 backdrop-blur">
        <div className="space-y-3 md:flex md:items-center md:justify-between md:space-y-0 md:gap-4">
          <div>
            <div className="font-medium">Preferências de cookies e analytics</div>
            <div className="text-sm text-muted-foreground">
              Usamos cookies essenciais para autenticação e funcionamento da plataforma. Analytics é opcional e ajuda a melhorar onboarding, adoção e retenção, sem enviar e-mail, CPF ou CNPJ em texto aberto para terceiros.
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => { setConsent(false); setVisible(false); }}>Recusar analytics</Button>
            <Button onClick={() => { setConsent(true); setVisible(false); }}>Aceitar analytics</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
