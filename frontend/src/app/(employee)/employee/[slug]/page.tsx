"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { resolveTenantBySlug } from "@/lib/api/public";
import { otpStart, otpVerify } from "@/lib/api/employeePortal";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function EmployeeEntryPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();

  const [tenant, setTenant] = useState<{ tenant_id: string; name: string; slug: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [identifier, setIdentifier] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await resolveTenantBySlug(slug);
        setTenant(r);
      } catch (e: any) {
        toast.error(e?.message || "Tenant não encontrado");
        setTenant(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  async function sendOtp() {
    if (!tenant) return;
    try {
      await otpStart({ tenant_id: tenant.tenant_id, identifier });
      toast.success("OTP enviado");
      setOtpSent(true);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar OTP");
    }
  }

  async function verifyOtp() {
    if (!tenant) return;
    try {
      await otpVerify({ tenant_id: tenant.tenant_id, identifier, code });
      toast.success("Acesso liberado");
      router.push("/employee/dashboard");
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "OTP inválido");
    }
  }

  return (
    <div className="container py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Portal do colaborador</CardTitle>
            <CardDescription>
              {loading ? "Carregando…" : tenant ? `Empresa: ${tenant.name}` : "Empresa não encontrada"}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="space-y-2">
              <Label>Seu identificador</Label>
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Email / CPF / ID interno" />
              <div className="text-xs text-muted-foreground">O identificador deve coincidir com o cadastro do colaborador no Console.</div>
            </div>

            {!otpSent ? (
              <Button onClick={sendOtp} disabled={!tenant || !identifier}>Enviar código (OTP)</Button>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Código recebido</Label>
                  <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
                </div>
                <Button onClick={verifyOtp} disabled={!code}>Entrar</Button>
              </>
            )}

            <div className="text-xs text-muted-foreground">
              Alternativa: se você recebeu um link de acesso direto (magic link), basta abrir o link e você será autenticado automaticamente.
            </div>
          </CardContent>
        </Card>

        <div className="text-xs text-muted-foreground">
          Segurança: a sessão é armazenada em cookie HttpOnly. Em ambientes corporativos, recomenda-se SSO/IdP e controle de dispositivos.
        </div>
      </div>
    </div>
  );
}
