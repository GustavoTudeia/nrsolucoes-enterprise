"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Mail, Lock, CheckCircle, ArrowLeft, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/logo";

import { consolePasswordResetStart, consolePasswordResetConfirm } from "@/lib/api/auth";

const emailSchema = z.object({
  email: z.string().email("Email inválido"),
});
type EmailForm = z.infer<typeof emailSchema>;

const passwordSchema = z
  .object({
    newPassword: z.string().min(8, "Senha deve ter no mínimo 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirme a senha"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "As senhas não coincidem",
    path: ["confirmPassword"],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

export default function RecuperarSenhaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");
  
  // Estados: "email" | "enviado" | "nova-senha" | "sucesso"
  const [step, setStep] = useState<"email" | "enviado" | "nova-senha" | "sucesso">("email");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(false);
  
  const emailForm = useForm<EmailForm>({ 
    resolver: zodResolver(emailSchema), 
    defaultValues: { email: "" } 
  });
  
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  // Se tem token na URL, vai direto para o formulário de nova senha
  useEffect(() => {
    if (tokenFromUrl) {
      setStep("nova-senha");
    }
  }, [tokenFromUrl]);

  async function onSubmitEmail(values: EmailForm) {
    setLoading(true);
    try {
      setEmail(values.email);
      await consolePasswordResetStart(values.email);
      setStep("enviado");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar instruções");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitPassword(values: PasswordForm) {
    if (!tokenFromUrl) {
      toast.error("Token não encontrado. Use o link enviado por email.");
      return;
    }
    
    setLoading(true);
    try {
      await consolePasswordResetConfirm(tokenFromUrl, values.newPassword);
      setStep("sucesso");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao redefinir senha. O link pode ter expirado.");
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

        {/* ============================================================= */}
        {/* PASSO 1: Pedir email */}
        {/* ============================================================= */}
        {step === "email" && (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Esqueceu sua senha?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Informe seu e-mail e enviaremos um link para redefinir sua senha.
            </p>

            <form className="mt-6 space-y-4" onSubmit={emailForm.handleSubmit(onSubmitEmail)}>
              <div>
                <label className="text-sm font-medium" htmlFor="email">
                  E-mail
                </label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    className="w-full rounded-xl border bg-background pl-10 pr-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="seu@email.com"
                    {...emailForm.register("email")}
                  />
                </div>
                {emailForm.formState.errors.email && (
                  <div className="mt-1 text-xs text-destructive">{emailForm.formState.errors.email.message}</div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar link de recuperação"
                )}
              </Button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para login
                </Link>
              </div>
            </form>
          </>
        )}

        {/* ============================================================= */}
        {/* PASSO 2: Email enviado - aguardar usuário clicar no link */}
        {/* ============================================================= */}
        {step === "enviado" && (
          <>
            <div className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <Mail className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Verifique seu email</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Enviamos um link de recuperação para:
              </p>
              <p className="mt-1 font-medium text-foreground">{email}</p>
            </div>

            <div className="mt-6 space-y-4">
              <div className="rounded-xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                <p>📧 Verifique sua caixa de entrada e spam.</p>
                <p className="mt-2">O link expira em <strong>30 minutos</strong>.</p>
              </div>

              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => {
                  setStep("email");
                  emailForm.reset();
                }}
              >
                Tentar outro email
              </Button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-primary">
                  Voltar para login
                </Link>
              </div>
            </div>
          </>
        )}

        {/* ============================================================= */}
        {/* PASSO 3: Definir nova senha (vem do link do email) */}
        {/* ============================================================= */}
        {step === "nova-senha" && (
          <>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Criar nova senha</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Digite sua nova senha abaixo.
            </p>

            <form className="mt-6 space-y-4" onSubmit={passwordForm.handleSubmit(onSubmitPassword)}>
              <div>
                <label className="text-sm font-medium" htmlFor="newPassword">
                  Nova senha
                </label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    id="newPassword"
                    type="password"
                    className="w-full rounded-xl border bg-background pl-10 pr-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Mínimo 8 caracteres"
                    {...passwordForm.register("newPassword")}
                  />
                </div>
                {passwordForm.formState.errors.newPassword && (
                  <div className="mt-1 text-xs text-destructive">{passwordForm.formState.errors.newPassword.message}</div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium" htmlFor="confirmPassword">
                  Confirmar nova senha
                </label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    id="confirmPassword"
                    type="password"
                    className="w-full rounded-xl border bg-background pl-10 pr-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Digite novamente"
                    {...passwordForm.register("confirmPassword")}
                  />
                </div>
                {passwordForm.formState.errors.confirmPassword && (
                  <div className="mt-1 text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Redefinir senha"
                )}
              </Button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-muted-foreground hover:text-primary">
                  Cancelar e voltar ao login
                </Link>
              </div>
            </form>
          </>
        )}

        {/* ============================================================= */}
        {/* PASSO 4: Sucesso */}
        {/* ============================================================= */}
        {step === "sucesso" && (
          <>
            <div className="text-center">
              <div className="mx-auto mb-4 w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Senha redefinida!</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sua senha foi alterada com sucesso. Você já pode fazer login.
              </p>
            </div>

            <div className="mt-6">
              <Button className="w-full" onClick={() => router.push("/login")}>
                Ir para login
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
