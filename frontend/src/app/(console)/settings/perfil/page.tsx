"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import {
  User,
  Mail,
  Phone,
  CreditCard,
  Building2,
  Shield,
  Calendar,
  Clock,
  Loader2,
  ArrowLeft,
  Save,
} from "lucide-react";
import Link from "next/link";

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
  if (/^(\d)\1+$/.test(digits)) return false;
  
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9])) return false;
  
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

export default function PerfilPage() {
  const router = useRouter();
  const { me, refresh } = useConsole();
  
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Valores originais para comparação
  const [originalValues, setOriginalValues] = useState({
    fullName: "",
    phone: "",
    cpf: "",
  });

  useEffect(() => {
    if (me) {
      const initialFullName = me.full_name || "";
      const initialPhone = me.phone ? maskPhone(me.phone) : "";
      const initialCpf = me.cpf ? maskCPF(me.cpf) : "";
      
      setFullName(initialFullName);
      setPhone(initialPhone);
      setCpf(initialCpf);
      
      setOriginalValues({
        fullName: initialFullName,
        phone: initialPhone,
        cpf: initialCpf,
      });
      
      setHasChanges(false);
    }
  }, [me]);

  // Verificar se houve mudanças
  useEffect(() => {
    const changed = 
      fullName !== originalValues.fullName ||
      phone !== originalValues.phone ||
      cpf !== originalValues.cpf;
    setHasChanges(changed);
  }, [fullName, phone, cpf, originalValues]);

  function handleCpfChange(value: string) {
    const masked = maskCPF(value);
    setCpf(masked);
    
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

  function handlePhoneChange(value: string) {
    setPhone(maskPhone(value));
  }

  async function handleSave() {
    // Validar CPF se preenchido
    const cpfDigits = cpf.replace(/\D/g, "");
    if (cpfDigits.length > 0 && cpfDigits.length !== 11) {
      toast.error("CPF deve ter 11 dígitos");
      return;
    }
    if (cpfDigits.length === 11 && !isValidCPF(cpfDigits)) {
      toast.error("CPF inválido");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/bff/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          full_name: fullName || null,
          phone: phone.replace(/\D/g, "") || null,
          cpf: cpfDigits || null,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.detail || "Erro ao salvar");
      }

      toast.success("Perfil atualizado com sucesso!");
      
      // Atualiza valores originais
      setOriginalValues({
        fullName,
        phone,
        cpf,
      });
      setHasChanges(false);
      
      refresh();
    } catch (e: any) {
      toast.error(e.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr: string | null | undefined) {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (!me) {
    return (
      <div className="container py-8 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <PageHeader
          title="Meu Perfil"
          description="Gerencie suas informações pessoais"
        />
      </div>

      {/* Avatar e Info Básica */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-3xl font-semibold text-primary">
              {(me.full_name || me.email || "U")[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold">{me.full_name || "Usuário"}</h2>
              <p className="text-muted-foreground">{me.email}</p>
              <div className="flex items-center gap-4 mt-2">
                {me.roles?.map((role: string) => (
                  <span
                    key={role}
                    className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 px-2 py-1 rounded-full"
                  >
                    <Shield className="h-3 w-3" />
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dados Pessoais */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Dados Pessoais
          </CardTitle>
          <CardDescription>
            Informações que identificam você na plataforma
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  value={me.email || ""}
                  disabled
                  className="pl-10 bg-muted"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                O email não pode ser alterado
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="(11) 98765-4321"
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="cpf"
                  value={cpf}
                  onChange={(e) => handleCpfChange(e.target.value)}
                  placeholder="000.000.000-00"
                  className={`pl-10 ${cpfError ? "border-red-500" : ""}`}
                />
              </div>
              {cpfError ? (
                <p className="text-xs text-red-500">{cpfError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Permite login por CPF além do email
                </p>
              )}
            </div>
          </div>

          {/* Botão Salvar dentro do card */}
          <div className="pt-4 flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={saving || !hasChanges || !!cpfError}
              size="lg"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Salvar alterações
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Informações da Conta */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Informações da Conta
          </CardTitle>
          <CardDescription>
            Detalhes sobre sua conta e organização
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Organização</div>
                <div className="text-sm text-muted-foreground">
                  {me.tenant?.name || "Não definida"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Papel</div>
                <div className="text-sm text-muted-foreground">
                  {me.roles?.join(", ") || "Usuário"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Conta criada em</div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(me.created_at)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">Último acesso</div>
                <div className="text-sm text-muted-foreground">
                  {formatDate(me.last_login_at)}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}