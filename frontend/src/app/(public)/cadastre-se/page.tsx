"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Building2, User, Mail, Lock, Phone, CreditCard, Loader2 } from "lucide-react";
import { publicSignup } from "@/lib/api/public";
import { BrandLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Máscaras
function maskCNPJ(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

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

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

const schema = z.object({
  company_name: z.string().min(2, "Informe o nome da empresa"),
  cnpj: z.string().optional(),
  slug: z
    .string()
    .min(2, "Informe um slug (ex.: minha-empresa)")
    .regex(/^[a-z0-9\-]+$/, "Use somente a-z, 0-9 e hífen"),
  admin_name: z.string().min(2, "Informe seu nome completo"),
  admin_email: z.string().email("Email inválido"),
  admin_cpf: z.string().optional(),
  admin_phone: z.string().optional(),
  admin_password: z.string().min(8, "Mínimo 8 caracteres"),
  admin_password_confirm: z.string().min(8, "Confirme a senha"),
}).refine((data) => data.admin_password === data.admin_password_confirm, {
  message: "As senhas não coincidem",
  path: ["admin_password_confirm"],
});

type FormData = z.infer<typeof schema>;

export default function SignupPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [affiliate, setAffiliate] = useState<string | null>(null);
  const [cpfError, setCpfError] = useState("");

  const selectedPlan = useMemo(() => params.get("plan"), [params]);

  useEffect(() => {
    const code = localStorage.getItem("nr_affiliate_code");
    if (code) setAffiliate(code);
  }, []);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: "",
      cnpj: "",
      slug: "",
      admin_name: "",
      admin_email: "",
      admin_cpf: "",
      admin_phone: "",
      admin_password: "",
      admin_password_confirm: "",
    },
  });

  // Auto-gerar slug a partir do nome da empresa
  const companyName = form.watch("company_name");
  useEffect(() => {
    if (companyName && !form.getValues("slug")) {
      form.setValue("slug", generateSlug(companyName));
    }
  }, [companyName, form]);

  function handleCpfChange(value: string) {
    const masked = maskCPF(value);
    form.setValue("admin_cpf", masked, { shouldDirty: true, shouldTouch: true });
    
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

  async function onSubmit(values: FormData) {
    // Validação de CPF se preenchido
    const cpfDigits = values.admin_cpf?.replace(/\D/g, "") || "";
    if (cpfDigits.length > 0) {
      if (cpfDigits.length !== 11) {
        toast.error("CPF deve ter 11 dígitos");
        return;
      }
      if (!isValidCPF(cpfDigits)) {
        toast.error("CPF inválido");
        return;
      }
    }

    try {
      await publicSignup({
        company_name: values.company_name,
        cnpj: values.cnpj?.replace(/\D/g, "") || undefined,
        slug: values.slug,
        admin_name: values.admin_name,
        admin_email: values.admin_email,
        admin_cpf: cpfDigits || undefined,
        admin_phone: values.admin_phone?.replace(/\D/g, "") || undefined,
        admin_password: values.admin_password,
        affiliate_code: affiliate || undefined,
        plan_key: selectedPlan || undefined,
      });
      toast.success("Conta criada com sucesso! Bem-vindo!");
      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha no cadastro. Verifique os dados e tente novamente.");
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)]">
      <div className="container grid items-stretch gap-6 py-10 md:grid-cols-2 md:py-14">
        <Card className="relative overflow-hidden p-6 md:p-8">
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-tr from-primary/10 via-accent/10 to-transparent" />
          <div className="flex items-center justify-between">
            <BrandLogo linked={false} />
            {affiliate ? (
              <div className="rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground">
                Indicação: <span className="font-medium text-foreground">{affiliate}</span>
              </div>
            ) : null}
          </div>

          <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight">Criar sua conta</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Configure sua empresa e comece a usar a plataforma.
            {selectedPlan ? ` Plano selecionado: ${selectedPlan}.` : ""}
          </p>

          <form className="mt-6 space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
            {/* Seção: Dados da Empresa */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Building2 className="h-4 w-4" />
                Dados da Empresa
              </div>

              <div>
                <label className="text-sm font-medium">Nome da Empresa *</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Ex.: Metalúrgica Exemplo Ltda"
                  {...form.register("company_name")}
                />
                {form.formState.errors.company_name && (
                  <div className="mt-1 text-xs text-destructive">{form.formState.errors.company_name.message}</div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">CNPJ</label>
                  <input
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="00.000.000/0000-00"
                    value={form.watch("cnpj") || ""}
                    onChange={(e) => form.setValue("cnpj", maskCNPJ(e.target.value), { shouldDirty: true, shouldTouch: true })}
                  />
                  <div className="mt-1 text-xs text-muted-foreground">Opcional, mas recomendado</div>
                </div>

                <div>
                  <label className="text-sm font-medium">Slug *</label>
                  <input
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="minha-empresa"
                    {...form.register("slug")}
                  />
                  {form.formState.errors.slug && (
                    <div className="mt-1 text-xs text-destructive">{form.formState.errors.slug.message}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Seção: Dados do Administrador */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <User className="h-4 w-4" />
                Seus Dados (Administrador)
              </div>

              <div>
                <label className="text-sm font-medium">Nome Completo *</label>
                <input
                  className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Seu nome completo"
                  {...form.register("admin_name")}
                />
                {form.formState.errors.admin_name && (
                  <div className="mt-1 text-xs text-destructive">{form.formState.errors.admin_name.message}</div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Email *</label>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="voce@empresa.com.br"
                    {...form.register("admin_email")}
                  />
                  {form.formState.errors.admin_email && (
                    <div className="mt-1 text-xs text-destructive">{form.formState.errors.admin_email.message}</div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Telefone</label>
                  <input
                    type="tel"
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="(11) 98765-4321"
                    value={form.watch("admin_phone") || ""}
                    onChange={(e) => form.setValue("admin_phone", maskPhone(e.target.value), { shouldDirty: true, shouldTouch: true })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">CPF</label>
                <input
                  className={`mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring ${
                    cpfError ? "border-red-500" : ""
                  }`}
                  placeholder="000.000.000-00"
                  value={form.watch("admin_cpf") || ""}
                  onChange={(e) => handleCpfChange(e.target.value)}
                />
                {cpfError ? (
                  <div className="mt-1 text-xs text-red-500">{cpfError}</div>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">
                    Opcional. Permite login por CPF além do email.
                  </div>
                )}
              </div>
            </div>

            {/* Seção: Senha */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Lock className="h-4 w-4" />
                Segurança
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Senha *</label>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Mínimo 8 caracteres"
                    {...form.register("admin_password")}
                  />
                  {form.formState.errors.admin_password && (
                    <div className="mt-1 text-xs text-destructive">{form.formState.errors.admin_password.message}</div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium">Confirmar Senha *</label>
                  <input
                    type="password"
                    className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Repita a senha"
                    {...form.register("admin_password_confirm")}
                  />
                  {form.formState.errors.admin_password_confirm && (
                    <div className="mt-1 text-xs text-destructive">{form.formState.errors.admin_password_confirm.message}</div>
                  )}
                </div>
              </div>
            </div>

            <Button type="submit" disabled={form.formState.isSubmitting || !!cpfError} className="w-full">
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                "Criar conta"
              )}
            </Button>

            <div className="text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link className="text-primary underline underline-offset-4" href="/login">
                Fazer login
              </Link>
            </div>

            <div className="text-xs text-muted-foreground">
              Ao continuar, você concorda com nossos{" "}
              <Link className="underline underline-offset-4" href="/termos">
                Termos de Uso
              </Link>{" "}
              e{" "}
              <Link className="underline underline-offset-4" href="/privacidade">
                Política de Privacidade
              </Link>
              .
            </div>
          </form>
        </Card>

        <div className="relative hidden overflow-hidden rounded-3xl border bg-card shadow-xl md:block">
          <Image
            src="/brand/auth-enterprise.svg"
            alt="Plataforma segura para dados sensíveis - LGPD, NR-1, Enterprise"
            width={800}
            height={600}
            className="h-full w-full object-cover"
            priority
          />
        </div>
      </div>
    </div>
  );
}