"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Building2, User, Shield, CheckCircle, XCircle, Mail } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BrandLogo } from "@/components/brand/logo";

interface InvitationPreview {
  email: string;
  full_name: string | null;
  role_name: string;
  tenant_name: string;
  cnpj_name: string | null;
  org_unit_name: string | null;
  invited_by_name: string | null;
  expires_at: string;
}

interface ValidationResult {
  valid: boolean;
  message?: string;
  user_exists: boolean;
  invitation?: InvitationPreview;
}

// Máscara de CPF
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

// Máscara de telefone
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function ConvitePage({
  params,
}: {
  params: { token: string };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  
  // Form para novo usuário
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    validateInvitation();
  }, [params.token]);

  async function validateInvitation() {
    try {
      // Chama o backend diretamente via proxy do Next.js ou URL absoluta
      const baseUrl = typeof window !== "undefined" 
        ? window.location.origin 
        : "";
      const res = await fetch(
        `${baseUrl}/api/bff/invitations/validate/${params.token}`
      );
      const data = await res.json();
      setValidation(data);
      
      if (data.invitation?.full_name) {
        setFullName(data.invitation.full_name);
      }
    } catch (err) {
      setValidation({ valid: false, message: "Erro ao validar convite", user_exists: false });
    } finally {
      setLoading(false);
    }
  }

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
    } else if (digits.length > 0 && digits.length < 11) {
      setCpfError("");
    } else {
      setCpfError("");
    }
  }

  async function handleAcceptNewUser(e: React.FormEvent) {
    e.preventDefault();
    
    // Validação de CPF se preenchido
    const cpfDigits = cpf.replace(/\D/g, "");
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
    
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    
    if (password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres");
      return;
    }
    
    if (!acceptTerms) {
      toast.error("Você precisa aceitar os termos de uso");
      return;
    }

    setSubmitting(true);
    try {
      const baseUrl = typeof window !== "undefined" 
        ? window.location.origin 
        : "";
      const res = await fetch(
        `${baseUrl}/api/bff/invitations/accept/${params.token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            full_name: fullName,
            password,
            cpf: cpfDigits || null,
            phone: phone.replace(/\D/g, "") || null,
            accept_terms: acceptTerms,
          }),
        }
      );

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.detail || "Erro ao aceitar convite");
      }

      toast.success("Conta criada com sucesso!");
      router.push("/dashboard");
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || "Erro ao aceitar convite");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!validation?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold">Convite inválido</h1>
          <p className="text-muted-foreground mt-2">
            {validation?.message || "Este convite não existe, expirou ou já foi utilizado."}
          </p>
          <Link href="/login">
            <Button className="mt-6">Ir para login</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const inv = validation.invitation!;

  // Se usuário já existe, mostra opção de aceitar diretamente
  if (validation.user_exists) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-8">
          <div className="text-center mb-6">
            <BrandLogo linked={false} />
          </div>
          
          <div className="text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold">Você foi convidado!</h1>
            <p className="text-muted-foreground mt-2">
              Você já tem uma conta na plataforma. Faça login para aceitar o convite e acessar a nova empresa.
            </p>
          </div>

          <div className="mt-6 p-4 bg-muted rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{inv.tenant_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span>Papel: {inv.role_name}</span>
            </div>
            {inv.invited_by_name && (
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>Convidado por: {inv.invited_by_name}</span>
              </div>
            )}
          </div>

          <Link href={`/login?redirect=/convite/${params.token}/aceitar`}>
            <Button className="w-full mt-6">
              Fazer login para aceitar
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Formulário para criar nova conta
  return (
    <div className="min-h-screen py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <BrandLogo linked={false} />
        </div>

        <Card className="p-6 md:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold">Criar sua conta</h1>
            <p className="text-muted-foreground mt-2">
              Você foi convidado para acessar a plataforma
            </p>
          </div>

          <div className="p-4 bg-muted rounded-lg space-y-2 mb-6">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{inv.tenant_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              <span>Papel: {inv.role_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{inv.email}</span>
            </div>
          </div>

          <form onSubmit={handleAcceptNewUser} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nome completo *</label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="Seu nome completo"
              />
            </div>

            <div>
              <label className="text-sm font-medium">CPF (opcional)</label>
              <input
                type="text"
                inputMode="numeric"
                className={`mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm ${
                  cpfError ? "border-red-500" : ""
                }`}
                value={cpf}
                onChange={(e) => handleCpfChange(e.target.value)}
                placeholder="123.456.789-00"
              />
              {cpfError ? (
                <p className="text-xs text-red-500 mt-1">{cpfError}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  O CPF permite login sem email
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Telefone (opcional)</label>
              <input
                type="text"
                inputMode="tel"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="(11) 98765-4321"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Senha *</label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Confirmar senha *</label>
              <input
                type="password"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="Repita a senha"
              />
            </div>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1"
              />
              <span className="text-sm text-muted-foreground">
                Li e aceito os{" "}
                <Link href="/termos" className="text-primary underline" target="_blank">
                  Termos de Uso
                </Link>{" "}
                e a{" "}
                <Link href="/privacidade" className="text-primary underline" target="_blank">
                  Política de Privacidade
                </Link>
              </span>
            </label>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={submitting || !!cpfError}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Criando conta...
                </>
              ) : (
                "Criar conta e acessar"
              )}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}