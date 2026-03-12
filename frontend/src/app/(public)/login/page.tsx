"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { LockKeyhole, ShieldCheck, Mail, CreditCard, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { consoleLogin, consoleLoginCPF } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand/logo";

type LoginMethod = "email" | "cpf" | "otp";

// Máscara de CPF: 123.456.789-00
function maskCPF(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// Validação de CPF
function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, "");
  
  if (digits.length !== 11) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1+$/.test(digits)) return false;
  
  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[10])) return false;
  
  return true;
}

export default function LoginPage() {
  const [loginMethod, setLoginMethod] = useState<LoginMethod>("email");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/dashboard";

  // Estados para OTP
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"email" | "code">("email");
  const [otpLoading, setOtpLoading] = useState(false);

  function handleCpfChange(value: string) {
    const masked = maskCPF(value);
    setCpf(masked);
    
    // Valida apenas se tiver 11 dígitos
    const digits = value.replace(/\D/g, "");
    if (digits.length === 11) {
      if (!isValidCPF(digits)) {
        setCpfError("CPF inválido");
      } else {
        setCpfError("");
      }
    } else {
      setCpfError("");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    if (loginMethod === "cpf") {
      const cleanCPF = cpf.replace(/\D/g, "");
      if (cleanCPF.length !== 11) {
        toast.error("CPF deve ter 11 dígitos");
        return;
      }
      if (!isValidCPF(cleanCPF)) {
        toast.error("CPF inválido");
        return;
      }
    }
    
    setLoading(true);
    try {
      if (loginMethod === "email") {
        await consoleLogin(email, password);
      } else {
        // Remove formatação do CPF
        const cleanCPF = cpf.replace(/\D/g, "");
        await consoleLoginCPF(cleanCPF, password);
      }
      toast.success("Login realizado com sucesso");
      // Full page navigation to ensure middleware processes the new cookie
      window.location.href = redirectTo;
    } catch (err: any) {
      toast.error(err?.message || "Credenciais inválidas. Verifique os dados e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!otpEmail) {
      toast.error("Informe o email");
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch("/api/bff/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erro ao enviar código");
      toast.success("Código enviado! Verifique seu email.");
      setOtpStep("code");
    } catch (err: any) {
      toast.error(err.message || "Falha ao enviar código");
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      toast.error("Digite o código de 6 dígitos");
      return;
    }
    setOtpLoading(true);
    try {
      const res = await fetch("/api/bff/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: otpEmail, code: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Código inválido");
      toast.success("Login realizado com sucesso");
      window.location.href = redirectTo;
    } catch (err: any) {
      toast.error(err.message || "Código inválido ou expirado");
    } finally {
      setOtpLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="container grid items-stretch gap-6 py-10 md:grid-cols-2 md:py-14">
        <Card className="relative overflow-hidden p-6 md:p-8">
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/10 via-accent/10 to-transparent" />

          <div className="flex items-center justify-between">
            <BrandLogo linked={false} />
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Console seguro
            </div>
          </div>

          <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">Acessar console</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre com sua conta corporativa para acessar indicadores, relatórios e evidências.
          </p>

          {/* Toggle Email / CPF / OTP */}
          <div className="mt-6 flex rounded-xl border bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setLoginMethod("email")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                loginMethod === "email"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Mail className="h-4 w-4" />
              Email
            </button>
            <button
              type="button"
              onClick={() => setLoginMethod("cpf")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                loginMethod === "cpf"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CreditCard className="h-4 w-4" />
              CPF
            </button>
            <button
              type="button"
              onClick={() => {
                setLoginMethod("otp");
                setOtpStep("email");
                setOtpCode("");
              }}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                loginMethod === "otp"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <KeyRound className="h-4 w-4" />
              Código
            </button>
          </div>

          {/* Formulário Email/CPF */}
          {(loginMethod === "email" || loginMethod === "cpf") && (
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              {loginMethod === "email" ? (
                <div>
                  <label className="text-sm font-medium" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="voce@empresa.com.br"
                    autoComplete="email"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-sm font-medium" htmlFor="cpf">
                    CPF
                  </label>
                  <input
                    id="cpf"
                    type="text"
                    inputMode="numeric"
                    className={`mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring ${
                      cpfError ? "border-red-500" : ""
                    }`}
                    value={cpf}
                    onChange={(e) => handleCpfChange(e.target.value)}
                    required
                    placeholder="123.456.789-00"
                    autoComplete="off"
                  />
                  {cpfError && (
                    <p className="mt-1 text-xs text-red-500">{cpfError}</p>
                  )}
                </div>
              )}

              <div>
                <label className="text-sm font-medium" htmlFor="password">
                  Senha
                </label>
                <input
                  id="password"
                  type="password"
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              <Button className="w-full" disabled={loading || !!cpfError} type="submit">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <Link className="text-muted-foreground underline underline-offset-4" href="/recuperar-senha">
                  Esqueci minha senha
                </Link>
                <Link className="text-muted-foreground underline underline-offset-4" href="/cadastre-se">
                  Criar conta
                </Link>
              </div>

              <div className="text-center">
                <Link className="text-sm text-primary underline underline-offset-4" href="/magic-login">
                  Entrar sem senha (link por email)
                </Link>
              </div>

              <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <LockKeyhole className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    Acesso seguro com criptografia de ponta. Seus dados estão protegidos conforme a LGPD.
                  </p>
                </div>
              </div>
            </form>
          )}

          {/* Formulário OTP */}
          {loginMethod === "otp" && (
            <>
              {otpStep === "email" ? (
                <form onSubmit={handleRequestOTP} className="mt-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium" htmlFor="otpEmail">
                      Email
                    </label>
                    <input
                      id="otpEmail"
                      type="email"
                      className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                      value={otpEmail}
                      onChange={(e) => setOtpEmail(e.target.value)}
                      required
                      placeholder="voce@empresa.com.br"
                      autoComplete="email"
                    />
                  </div>

                  <Button className="w-full" disabled={otpLoading} type="submit">
                    {otpLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      "Enviar código por email"
                    )}
                  </Button>

                  <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                    <div className="flex items-start gap-2">
                      <Mail className="mt-0.5 h-4 w-4 text-primary" />
                      <p>
                        Enviaremos um código de 6 dígitos para seu email. O código expira em 10 minutos.
                      </p>
                    </div>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="mt-4 space-y-4">
                  <div className="rounded-xl border bg-green-50 dark:bg-green-900/20 p-4 text-sm text-green-700 dark:text-green-300">
                    Código enviado para <strong>{otpEmail}</strong>
                  </div>

                  <div>
                    <label className="text-sm font-medium" htmlFor="otpCode">
                      Código de verificação
                    </label>
                    <input
                      id="otpCode"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm text-center tracking-[0.5em] font-mono outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      placeholder="000000"
                      autoComplete="one-time-code"
                    />
                  </div>

                  <Button className="w-full" disabled={otpLoading || otpCode.length !== 6} type="submit">
                    {otpLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verificando...
                      </>
                    ) : (
                      "Verificar e entrar"
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpStep("email");
                      setOtpCode("");
                    }}
                    className="w-full text-sm text-muted-foreground underline underline-offset-4"
                  >
                    Usar outro email
                  </button>
                </form>
              )}
            </>
          )}
        </Card>

        {/* Light theme illustration */}
        <div className="relative hidden overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#f8fafc] to-[#eef2ff] shadow-xl md:flex md:items-center md:justify-center dark:hidden">
          <Image
            src="/brand/auth-enterprise-light.svg"
            alt="Plataforma segura para dados sensíveis - LGPD, NR-1, Enterprise"
            width={800}
            height={600}
            className="w-full h-auto"
            priority
          />
        </div>
        {/* Dark theme illustration */}
        <div className="relative hidden overflow-hidden rounded-3xl border border-slate-700/50 bg-gradient-to-br from-[#0f172a] to-[#1e293b] shadow-xl dark:md:flex dark:md:items-center dark:md:justify-center">
          <Image
            src="/brand/auth-enterprise.svg"
            alt="Plataforma segura para dados sensíveis - LGPD, NR-1, Enterprise"
            width={800}
            height={600}
            className="w-full h-auto"
            priority
          />
        </div>
      </div>
    </div>
  );
}