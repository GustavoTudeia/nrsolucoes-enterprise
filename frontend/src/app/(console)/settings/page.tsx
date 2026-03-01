"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/console/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useConsole } from "@/components/console/console-provider";
import { getMe, updateMe } from "@/lib/api/auth"; 
import {
  Building2,
  CreditCard,
  Key,
  Lock,
  Mail,
  Moon,
  Palette,
  Shield,
  Sliders,
  Sun,
  User,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { useTheme } from "next-themes";

export default function SettingsPage() {
  const { me, refresh } = useConsole();
  const { theme, setTheme } = useTheme();
  
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Estados do modal de alterar senha
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  useEffect(() => {
    if (me) {
      setFullName(me.full_name || "");
      setEmail(me.email || "");
    }
  }, [me]);

  async function handleSaveProfile() {
    try {
      setSaving(true);
      await updateMe({ full_name: fullName });
      toast.success("Perfil atualizado com sucesso!");
      refresh();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  function resetPasswordForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setPasswordErrors({});
  }

  function validatePasswordForm(): boolean {
    const errors: typeof passwordErrors = {};

    if (!currentPassword) {
      errors.currentPassword = "Informe a senha atual";
    }

    if (!newPassword) {
      errors.newPassword = "Informe a nova senha";
    } else if (newPassword.length < 8) {
      errors.newPassword = "A senha deve ter no mínimo 8 caracteres";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Confirme a nova senha";
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = "As senhas não coincidem";
    }

    if (currentPassword && newPassword && currentPassword === newPassword) {
      errors.newPassword = "A nova senha deve ser diferente da atual";
    }

    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleChangePassword() {
    if (!validatePasswordForm()) return;

    setChangingPassword(true);
    try {
      const response = await fetch("/api/bff/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || data.message || "Erro ao alterar senha");
      }

      toast.success("Senha alterada com sucesso!");
      setPasswordModalOpen(false);
      resetPasswordForm();
    } catch (e: any) {
      if (e.message.includes("atual incorreta")) {
        setPasswordErrors({ currentPassword: "Senha atual incorreta" });
      } else {
        toast.error(e.message || "Falha ao alterar senha");
      }
    } finally {
      setChangingPassword(false);
    }
  }

  const settingsGroups = [
    {
      title: "Conta",
      items: [
        {
          icon: User,
          title: "Perfil",
          description: "Nome, email e informações pessoais",
          href: "/settings/perfil",
        },
        {
          icon: Lock,
          title: "Segurança",
          description: "Senha e autenticação",
          href: "#security",
        },
        {
          icon: Mail,
          title: "Notificações",
          description: "Preferências de email e alertas",
          href: "#notifications",
        },
      ],
    },
    {
      title: "Organização",
      items: [
        {
          icon: Building2,
          title: "Dados da Empresa",
          description: "Informações cadastrais e fiscal",
          href: "/org/cnpjs",
        },
        {
          icon: Shield,
          title: "Usuários e Permissões",
          description: "Gerenciar usuários, convites e acessos",
          href: "/settings/usuarios",
        },
        {
          icon: Sliders,
          title: "Enterprise",
          description: "SSO, branding e configurações avançadas",
          href: "/settings/enterprise",
        },
      ],
    },
    {
      title: "Assinatura",
      items: [
        {
          icon: CreditCard,
          title: "Plano Atual",
          description: "Gerenciar assinatura e pagamentos",
          href: "/billing",
        },
        {
          icon: Key,
          title: "API Keys",
          description: "Chaves de integração (em breve)",
          href: "#api",
        },
      ],
    },
  ];

  return (
    <div className="container py-8 space-y-8">
      <PageHeader
        title="Configurações"
        description="Gerencie sua conta, organização e preferências"
      />

      {/* Theme Toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Aparência
          </CardTitle>
          <CardDescription>Escolha o tema da interface</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Button
              variant={theme === "light" ? "default" : "outline"}
              onClick={() => setTheme("light")}
              className="flex items-center gap-2"
            >
              <Sun className="h-4 w-4" />
              Claro
            </Button>
            <Button
              variant={theme === "dark" ? "default" : "outline"}
              onClick={() => setTheme("dark")}
              className="flex items-center gap-2"
            >
              <Moon className="h-4 w-4" />
              Escuro
            </Button>
            <Button
              variant={theme === "system" ? "default" : "outline"}
              onClick={() => setTheme("system")}
            >
              Sistema
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Profile Section */}
      <Card id="profile">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Perfil
          </CardTitle>
          <CardDescription>Suas informações pessoais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                value={email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                O email não pode ser alterado
              </p>
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </CardContent>
      </Card>

      {/* Security Section */}
      <Card id="security">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Segurança
          </CardTitle>
          <CardDescription>Gerencie sua senha e autenticação</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Alterar senha</div>
              <div className="text-sm text-muted-foreground">
                Recomendamos usar uma senha forte e única
              </div>
            </div>
            <Button 
              variant="outline" 
              onClick={() => {
                resetPasswordForm();
                setPasswordModalOpen(true);
              }}
            >
              Alterar
            </Button>
          </div>
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <div className="font-medium">Autenticação em dois fatores</div>
              <div className="text-sm text-muted-foreground">
                Adicione uma camada extra de segurança
              </div>
            </div>
            <Button variant="outline" disabled>
              Em breve
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {settingsGroups.map((group) => (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle className="text-lg">{group.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium text-sm">{item.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Zona de perigo</CardTitle>
          <CardDescription>
            Ações irreversíveis para sua conta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg">
            <div>
              <div className="font-medium">Exportar meus dados</div>
              <div className="text-sm text-muted-foreground">
                Baixe uma cópia de todos os seus dados (LGPD)
              </div>
            </div>
            <Button variant="outline">Exportar</Button>
          </div>
          <div className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg">
            <div>
              <div className="font-medium text-destructive">Excluir conta</div>
              <div className="text-sm text-muted-foreground">
                Remove permanentemente sua conta e dados
              </div>
            </div>
            <Button variant="destructive" disabled>
              Excluir
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Modal de Alterar Senha */}
      <Dialog open={passwordModalOpen} onOpenChange={setPasswordModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Alterar senha
            </DialogTitle>
            <DialogDescription>
              Digite sua senha atual e escolha uma nova senha segura.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Senha Atual */}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Senha atual</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    setPasswordErrors((prev) => ({ ...prev, currentPassword: undefined }));
                  }}
                  placeholder="Digite sua senha atual"
                  className={passwordErrors.currentPassword ? "border-destructive" : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {passwordErrors.currentPassword && (
                <p className="text-xs text-destructive">{passwordErrors.currentPassword}</p>
              )}
            </div>

            {/* Nova Senha */}
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nova senha</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setPasswordErrors((prev) => ({ ...prev, newPassword: undefined }));
                  }}
                  placeholder="Mínimo 8 caracteres"
                  className={passwordErrors.newPassword ? "border-destructive" : ""}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {passwordErrors.newPassword && (
                <p className="text-xs text-destructive">{passwordErrors.newPassword}</p>
              )}
            </div>

            {/* Confirmar Nova Senha */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
              <Input
                id="confirmPassword"
                type={showNewPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setPasswordErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                }}
                placeholder="Digite novamente"
                className={passwordErrors.confirmPassword ? "border-destructive" : ""}
              />
              {passwordErrors.confirmPassword && (
                <p className="text-xs text-destructive">{passwordErrors.confirmPassword}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPasswordModalOpen(false);
                resetPasswordForm();
              }}
              disabled={changingPassword}
            >
              Cancelar
            </Button>
            <Button onClick={handleChangePassword} disabled={changingPassword}>
              {changingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Alterando...
                </>
              ) : (
                "Alterar senha"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}