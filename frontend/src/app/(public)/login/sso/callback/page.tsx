"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SsoCallbackPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [msg, setMsg] = useState<string>("Concluindo login SSO…");

  useEffect(() => {
    (async () => {
      const code = params.get("code");
      const state = params.get("state");
      if (!code || !state) {
        setMsg("Parâmetros inválidos. Retorne ao login.");
        return;
      }

      const redirect_uri = `${window.location.origin}/login/sso/callback`;

      const r = await fetch("/api/auth/console/sso/oidc/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, state, redirect_uri }),
      });

      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setMsg(data?.detail || "Falha no login SSO");
        return;
      }

      setMsg("Login realizado. Redirecionando…");
      router.replace("/dashboard");
    })();
  }, [params, router]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>SSO</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{msg}</p>
        </CardContent>
      </Card>
    </div>
  );
}
