"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Mail, CheckCircle, XCircle, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/logo";

type Step = "request" | "sent" | "verifying" | "success" | "error";

export default function MagicLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  const [step, setStep] = useState<Step>(tokenFromUrl ? "verifying" : "request");
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  
  // Evita chamada dupla (React StrictMode)
  const verifyAttempted = useRef(false);

  // Se tem token na URL, verifica automaticamente
  useEffect(() => {
    if (tokenFromUrl && !verifyAttempted.current) {
      verifyAttempted.current = true;
      verifyMagicLink(tokenFromUrl);
    }
  }, [tokenFromUrl]);

  async function verifyMagicLink(token: string) {
    setStep("verifying");
    try {
      const res = await fetch(`/api/bff/auth/verify-magic-link?token=${encodeURIComponent(token)}`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || "Link inválido ou expirado");
      }
      
      setStep("success");
      toast.success("Login realizado com sucesso!");
      
      // Redireciona após 1s
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
    } catch (err: any) {
      setErrorMessage(err.message || "Link inválido ou expirado");
      setStep("error");
    }
  }

  async function handleRequestMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier.trim()) {
      toast.error("Informe seu CPF ou email");
      return;
    }
    
    setLoading(true);
    try {
      const res = await fetch("/api/bff/auth/request-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || "Erro ao enviar link");
      }
      
      toast.success("Link enviado! Verifique seu email.");
      setStep("sent");
    } catch (err: any) {
      toast.error(err.message || "Falha ao enviar link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <Card className="relative w-full max-w-md overflow-hidden p-6 md:p-8">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/10 via-accent/10 to-transparent" />

        <div className="flex items-center justify-between mb-6">
          <BrandLogo linked={false} />
          <Link className="text-xs text-muted-foreground underline underline-offset-4" href="/login">
            Voltar ao login
          </Link>
        </div>

        {/* ============================================= */}
        {/* PASSO 1: Solicitar link */}
        {/* ============================================= */}
        {step === "request" && (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Acesso rápido</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Digite seu CPF ou email para receber um link de acesso direto.
            </p>

            <form onSubmit={handleRequestMagicLink} className="mt-6 space-y-4">
              <div>
                <label className="text-sm font-medium" htmlFor="identifier">
                  CPF ou Email
                </label>
                <div className="relative mt-1">
                  <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    id="identifier"
                    type="text"
                    className="w-full rounded-xl border bg-background pl-10 pr-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="123.456.789-00 ou email@empresa.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <Button className="w-full" disabled={loading} type="submit">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar link de acesso"
                )}
              </Button>

              <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    Enviaremos um link para seu email cadastrado. O link expira em 15 minutos.
                  </p>
                </div>
              </div>
            </form>
          </>
        )}

        {/* ============================================= */}
        {/* PASSO 2: Link enviado */}
        {/* ============================================= */}
        {step === "sent" && (
          <>
            <div className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <Mail className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Verifique seu email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Se encontrarmos seu cadastro, você receberá um link de acesso.
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                <p>📧 Verifique sua caixa de entrada e spam.</p>
                <p className="mt-2">O link expira em <strong>15 minutos</strong>.</p>
              </div>

              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => {
                  setStep("request");
                  setIdentifier("");
                }}
              >
                Tentar novamente
              </Button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-primary">
                  Voltar para login
                </Link>
              </div>
            </div>
          </>
        )}

        {/* ============================================= */}
        {/* PASSO 3: Verificando link */}
        {/* ============================================= */}
        {step === "verifying" && (
          <div className="text-center py-8">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">Verificando...</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Aguarde enquanto validamos seu acesso.
            </p>
          </div>
        )}

        {/* ============================================= */}
        {/* PASSO 4: Sucesso */}
        {/* ============================================= */}
        {step === "success" && (
          <div className="text-center py-8">
            <div className="mx-auto mb-4 w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Acesso autorizado!</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Redirecionando para o sistema...
            </p>
          </div>
        )}

        {/* ============================================= */}
        {/* PASSO 5: Erro */}
        {/* ============================================= */}
        {step === "error" && (
          <>
            <div className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center">
                <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Link inválido</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {errorMessage}
              </p>
            </div>

            <div className="mt-6 space-y-4">
              <Button 
                className="w-full" 
                onClick={() => {
                  setStep("request");
                  setIdentifier("");
                  setErrorMessage("");
                  // Limpa token da URL
                  router.push("/magic-login");
                }}
              >
                Solicitar novo link
              </Button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-primary">
                  Voltar para login
                </Link>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}