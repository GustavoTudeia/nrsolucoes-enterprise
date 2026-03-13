"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { useToast } from "@/hooks/use-toast";
import { useConsole } from "@/components/console/console-provider";

import { getTenantSettings, updateBrandingSettings, updatePrivacySettings, getSsoConfig, updateSsoConfig } from "@/lib/api/settings";
import { getMyLegalStatus, acceptLegal } from "@/lib/api/legal";
import { listUsersArray, listRoles, listUserRoles, assignRole, revokeRole } from "@/lib/api/users";
import { apiFetch } from "@/lib/api/client";
import type { TenantSettingsOut, SSOConfigOut, LegalStatusOut, UserOut, RoleOut, RoleAssignmentOut } from "@/lib/api/types";

interface Invitation {
  id: string;
  email: string;
  full_name: string | null;
  role_key: string;
  role_name: string;
  status: string;
  expires_at: string;
}

export default function EnterpriseSettingsPage() {
  const { me } = useConsole();
  const { toast } = useToast();

  const isTenantAdmin = useMemo(() => (me?.roles || []).includes("TENANT_ADMIN") || (me?.roles || []).includes("OWNER"), [me]);

  const [loading, setLoading] = useState(true);

  const [tenantSettings, setTenantSettings] = useState<TenantSettingsOut | null>(null);
  const [sso, setSso] = useState<SSOConfigOut | null>(null);
  const [legal, setLegal] = useState<LegalStatusOut | null>(null);

  const [users, setUsers] = useState<UserOut[]>([]);
  const [roles, setRoles] = useState<RoleOut[]>([]);
  const [rolesByUser, setRolesByUser] = useState<Record<string, RoleAssignmentOut[]>>({});
  
  // CNPJs do tenant
  const [cnpjs, setCnpjs] = useState<{ id: string; cnpj: string; legal_name: string }[]>([]);

  // Convites
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [usersTab, setUsersTab] = useState<"users" | "invitations">("users");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("TENANT_ADMIN");
  const [inviteCnpjId, setInviteCnpjId] = useState<string>("");
  const [inviteSending, setInviteSending] = useState(false);
  
  // Papéis que requerem seleção de CNPJ
  const rolesRequiringCnpj = ["CNPJ_MANAGER", "UNIT_MANAGER"];

  // saving states
  const [savingBranding, setSavingBranding] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savingSso, setSavingSso] = useState(false);

  // form states
  const [minAnon, setMinAnon] = useState<string>("5");

  const [brandName, setBrandName] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [primaryColor, setPrimaryColor] = useState<string>("");
  const [secondaryColor, setSecondaryColor] = useState<string>("");
  const [supportEmail, setSupportEmail] = useState<string>("");
  const [customDomain, setCustomDomain] = useState<string>("");
  const [loginBg, setLoginBg] = useState<string>("");

  const [ssoEnabled, setSsoEnabled] = useState<boolean>(false);
  const [issuerUrl, setIssuerUrl] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [clientSecret, setClientSecret] = useState<string>("");
  const [allowedDomainsText, setAllowedDomainsText] = useState<string>(""); // one per line

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);

        const [ts, ssoCfg, legalStatus] = await Promise.all([getTenantSettings(), getSsoConfig().catch(() => null), getMyLegalStatus()]);

        setTenantSettings(ts);
        setLegal(legalStatus);

        setMinAnon(String(ts.min_anon_threshold ?? 5));

        setBrandName(ts.brand_name || "");
        setLogoUrl(ts.logo_url || "");
        setPrimaryColor(ts.primary_color || "");
        setSecondaryColor(ts.secondary_color || "");
        setSupportEmail(ts.support_email || "");
        setCustomDomain(ts.custom_domain || "");
        setLoginBg(ts.login_background_url || "");

        if (ssoCfg) {
          setSso(ssoCfg);
          setSsoEnabled(!!ssoCfg.enabled);
          setIssuerUrl(ssoCfg.issuer_url || "");
          setClientId(ssoCfg.client_id || "");
          setAllowedDomainsText((ssoCfg.allowed_domains || []).join("\n"));
          setClientSecret(""); // nunca preencher automaticamente
        }

        // RBAC + CNPJs
        const [u, r, inv, cnpjList] = await Promise.all([
          listUsersArray().catch(() => []), 
          listRoles().catch(() => []),
          apiFetch<{ items: Invitation[] }>("console", "/invitations?status=pending").catch(() => ({ items: [] })),
          apiFetch<{ id: string; cnpj: string; legal_name: string }[]>("console", "/org/cnpjs").catch(() => [])
        ]);
        setUsers(u);
        setRoles(r);
        setInvitations(inv.items || []);
        setCnpjs(Array.isArray(cnpjList) ? cnpjList : []);

        const map: Record<string, RoleAssignmentOut[]> = {};
        await Promise.all(
          u.map(async (usr) => {
            const ur = await listUserRoles(usr.id).catch(() => []);
            map[usr.id] = ur;
          })
        );
        setRolesByUser(map);
      } catch (e: any) {
        toast({ title: "Erro ao carregar settings", description: e?.message || "" });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  async function loadInvitations() {
    try {
      const inv = await apiFetch<{ items: Invitation[] }>("console", "/invitations?status=pending");
      setInvitations(inv.items || []);
    } catch (e) {
      // ignore
    }
  }

  async function onSendInvitation() {
    if (!inviteEmail.trim()) {
      toast({ title: "Erro", description: "Informe o email" });
      return;
    }
    
    // Validar CNPJ obrigatório para certos papéis
    if (rolesRequiringCnpj.includes(inviteRole) && !inviteCnpjId) {
      toast({ title: "Erro", description: "Selecione um CNPJ para este papel" });
      return;
    }
    
    setInviteSending(true);
    try {
      await apiFetch("console", "/invitations", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteName || null,
          role_key: inviteRole,
          cnpj_id: inviteCnpjId || null,
          expires_days: 7,
        }),
      });
      toast({ title: "Convite enviado com sucesso!" });
      setInviteModalOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("TENANT_ADMIN");
      setInviteCnpjId("");
      loadInvitations();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Falha ao enviar convite" });
    } finally {
      setInviteSending(false);
    }
  }

  async function onResendInvitation(invitationId: string) {
    try {
      await apiFetch("console", `/invitations/${invitationId}/resend`, { method: "POST" });
      toast({ title: "Convite reenviado!" });
      loadInvitations();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onCancelInvitation(invitationId: string) {
    if (!confirm("Cancelar este convite?")) return;
    try {
      await apiFetch("console", `/invitations/${invitationId}`, { method: "DELETE" });
      toast({ title: "Convite cancelado" });
      loadInvitations();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onSavePrivacy() {
    try {
      setSavingPrivacy(true);
      const n = Number(minAnon);
      if (!Number.isFinite(n) || n < 3) {
        toast({ title: "Valor inválido", description: "min_anon_threshold deve ser >= 3" });
        return;
      }
      const updated = await updatePrivacySettings({ min_anon_threshold: n });
      setTenantSettings(updated);
      toast({ title: "Privacidade atualizada" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    } finally {
      setSavingPrivacy(false);
    }
  }

  async function onSaveBranding() {
    try {
      setSavingBranding(true);
      const updated = await updateBrandingSettings({
        brand_name: brandName || null,
        logo_url: logoUrl || null,
        primary_color: primaryColor || null,
        secondary_color: secondaryColor || null,
        support_email: supportEmail || null,
        custom_domain: customDomain || null,
        login_background_url: loginBg || null,
      });
      setTenantSettings(updated);
      toast({ title: "Branding atualizado" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    } finally {
      setSavingBranding(false);
    }
  }

  async function onSaveSso() {
    try {
      setSavingSso(true);
      const domains = allowedDomainsText
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);

      const updated = await updateSsoConfig({
        enabled: ssoEnabled,
        issuer_url: issuerUrl || undefined,
        client_id: clientId || undefined,
        client_secret: clientSecret || undefined,
        allowed_domains: domains,
      });
      setSso(updated);
      toast({ title: "SSO atualizado" });
      setClientSecret("");
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    } finally {
      setSavingSso(false);
    }
  }

  async function onAcceptLegal() {
    try {
      await acceptLegal();
      const refreshed = await getMyLegalStatus();
      setLegal(refreshed);
      toast({ title: "Aceite registrado" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onAssignRole(userId: string, roleKey: string) {
    try {
      await assignRole(userId, { role_key: roleKey });
      const ur = await listUserRoles(userId);
      setRolesByUser((prev) => ({ ...prev, [userId]: ur }));
      toast({ title: "Role atribuída" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  async function onRevokeRole(userId: string, assignmentId: string) {
    try {
      await revokeRole(userId, assignmentId);
      const ur = await listUserRoles(userId);
      setRolesByUser((prev) => ({ ...prev, [userId]: ur }));
      toast({ title: "Role removida" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "" });
    }
  }

  if (!isTenantAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Settings Enterprise</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Acesso restrito ao perfil TENANT_ADMIN.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const brandingConfigured = !!(brandName || logoUrl || primaryColor);
  const ssoConfigured = ssoEnabled && !!issuerUrl;
  const legalOk = legal ? !legal.is_missing : false;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings Enterprise</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configuracoes avancadas do tenant: white-label, SSO, privacidade e gestao de perfis
          </p>
        </div>
        <div className="flex items-center gap-2">
          {me?.tenant?.name && (
            <Badge variant="outline" className="text-xs">{me.tenant.name}</Badge>
          )}
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Usuarios</p>
            <p className="text-3xl font-bold mt-1 text-blue-600">{users.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Convites</p>
            <p className="text-3xl font-bold mt-1 text-amber-600">{invitations.length}</p>
            <p className="text-xs text-muted-foreground mt-1">pendentes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Branding</p>
            <Badge className={`mt-2 ${brandingConfigured ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
              {brandingConfigured ? "Configurado" : "Padrao"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">SSO</p>
            <Badge className={`mt-2 ${ssoConfigured ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
              {ssoConfigured ? "Ativo" : "Inativo"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Termos</p>
            <Badge className={`mt-2 ${legalOk ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}`}>
              {legalOk ? "Aceito" : "Pendente"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="branding">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="branding">White-label</TabsTrigger>
          <TabsTrigger value="privacy">Privacidade</TabsTrigger>
          <TabsTrigger value="sso">SSO (OIDC)</TabsTrigger>
          <TabsTrigger value="roles">Usuarios & Perfis</TabsTrigger>
          <TabsTrigger value="legal">Termos</TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">White-label / Branding</CardTitle>
              <CardDescription>Personalize a aparencia da plataforma para seu tenant</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da marca</Label>
                  <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Ex: NR Solucoes" />
                </div>
                <div className="space-y-2">
                  <Label>Email de suporte</Label>
                  <Input value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="suporte@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
                  {logoUrl && (
                    <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={logoUrl} alt="Logo preview" className="max-h-full max-w-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Background (login) URL</Label>
                  <Input value={loginBg} onChange={(e) => setLoginBg(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>Cor primaria</Label>
                  <div className="flex gap-2 items-center">
                    <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#0f172a" className="flex-1" />
                    {primaryColor && (
                      <div className="w-9 h-9 rounded border shrink-0" style={{ backgroundColor: primaryColor }} title={primaryColor} />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Cor secundaria</Label>
                  <div className="flex gap-2 items-center">
                    <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} placeholder="#22c55e" className="flex-1" />
                    {secondaryColor && (
                      <div className="w-9 h-9 rounded border shrink-0" style={{ backgroundColor: secondaryColor }} title={secondaryColor} />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Dominio customizado</Label>
                  <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="app.empresa.com" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={onSaveBranding} disabled={loading || savingBranding}>
                  {savingBranding ? "Salvando..." : "Salvar branding"}
                </Button>
                <span className="text-xs text-muted-foreground">Requer feature WHITE_LABEL (Enterprise).</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Privacidade e Anonimizacao</CardTitle>
              <CardDescription>Configuracoes de conformidade LGPD para agregacao de dados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-sm">
                <Label>Limite minimo de anonimizacao (min_anon_threshold)</Label>
                <Input value={minAnon} onChange={(e) => setMinAnon(e.target.value)} type="number" min={3} />
                <p className="text-xs text-muted-foreground">
                  Define o minimo de respostas por grupo (por unidade/setor) para liberar agregados (LGPD).
                  Valor minimo recomendado: 5.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={onSavePrivacy} disabled={loading || savingPrivacy}>
                  {savingPrivacy ? "Salvando..." : "Salvar privacidade"}
                </Button>
                <span className="text-xs text-muted-foreground">Requer feature ANONYMIZATION.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sso" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Single Sign-On (OIDC)</CardTitle>
                  <CardDescription>Autenticacao corporativa via provedor de identidade</CardDescription>
                </div>
                <Badge className={ssoConfigured ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}>
                  {ssoConfigured ? "Ativo" : "Inativo"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ssoEnabled} onChange={(e) => setSsoEnabled(e.target.checked)} className="rounded" />
                <span className="text-sm font-medium">Habilitar SSO</span>
              </label>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Issuer URL</Label>
                  <Input value={issuerUrl} onChange={(e) => setIssuerUrl(e.target.value)} placeholder="https://login.microsoftonline.com/{tenant}/v2.0" />
                </div>
                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="..." />
                </div>
                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={sso?.has_client_secret ? "(ja configurado) - preencha para trocar" : "(nao configurado)"} />
                </div>
                <div className="space-y-2">
                  <Label>Dominios permitidos</Label>
                  <Textarea value={allowedDomainsText} onChange={(e) => setAllowedDomainsText(e.target.value)} placeholder={"empresa.com\nsubsidiaria.com.br"} />
                  <p className="text-xs text-muted-foreground">Um dominio por linha. O login SSO seleciona o tenant pelo dominio do email.</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={onSaveSso} disabled={loading || savingSso}>
                  {savingSso ? "Salvando..." : "Salvar SSO"}
                </Button>
                <span className="text-xs text-muted-foreground">Requer feature SSO_OIDC (Enterprise).</span>
              </div>

              <Separator />

              <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Endpoints de integracao</p>
                <div className="text-sm">
                  <span className="font-medium">Start:</span> <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/api/v1/auth/sso/oidc/start</code>
                </div>
                <div className="text-sm">
                  <span className="font-medium">Callback:</span> <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/api/v1/auth/sso/oidc/callback</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Usuarios & Convites</CardTitle>
                  <CardDescription>
                    Gerencie usuarios e envie convites para novos membros
                  </CardDescription>
                </div>
                <Button onClick={() => setInviteModalOpen(true)}>
                  + Convidar Usuário
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Sub-abas: Usuários | Convites Pendentes */}
              <div className="flex gap-4 border-b">
                <button
                  onClick={() => setUsersTab("users")}
                  className={`pb-2 px-1 text-sm font-medium transition-colors ${
                    usersTab === "users"
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Usuários ({users.length})
                </button>
                <button
                  onClick={() => setUsersTab("invitations")}
                  className={`pb-2 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
                    usersTab === "invitations"
                      ? "border-b-2 border-primary text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Convites Pendentes
                  {invitations.length > 0 && (
                    <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                      {invitations.length}
                    </span>
                  )}
                </button>
              </div>

              {usersTab === "users" ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Papéis</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{u.full_name || "Sem nome"}</div>
                            <div className="text-sm text-muted-foreground">{u.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(rolesByUser[u.id] || []).map((ra) => (
                              <span key={ra.id} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 rounded px-2 py-1">
                                {ra.role_key}
                                <button 
                                  className="hover:text-red-600" 
                                  onClick={() => onRevokeRole(u.id, ra.id)}
                                  title="Remover papel"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                            {(rolesByUser[u.id] || []).length === 0 && (
                              <span className="text-xs text-muted-foreground">Nenhum papel</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Select
                            value=""
                            onValueChange={(roleKey) => { if (roleKey) onAssignRole(u.id, roleKey); }}
                          >
                            <SelectTrigger className="w-[180px] h-9">
                              <SelectValue placeholder="+ Adicionar papel" />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.filter(r => r.key !== "OWNER").map((r) => (
                                <SelectItem key={r.key} value={r.key}>
                                  {r.name || r.key}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Nenhum usuário encontrado
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : (
                <div className="space-y-3">
                  {invitations.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Nenhum convite pendente
                    </div>
                  ) : (
                    invitations.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="font-medium">{inv.email}</div>
                          <div className="text-sm text-muted-foreground">
                            Papel: {inv.role_name || inv.role_key} • Expira em {new Date(inv.expires_at).toLocaleDateString("pt-BR")}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => onResendInvitation(inv.id)}>
                            Reenviar
                          </Button>
                          <Button variant="outline" size="sm" className="text-red-600" onClick={() => onCancelInvitation(inv.id)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Modal de Convite */}
          {inviteModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <Card className="w-full max-w-md">
                <CardHeader>
                  <CardTitle>Convidar Usuário</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Email *</Label>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="usuario@empresa.com"
                    />
                  </div>
                  <div>
                    <Label>Nome (opcional)</Label>
                    <Input
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Papel *</Label>
                    <Select
                      value={inviteRole}
                      onValueChange={(v) => {
                        setInviteRole(v);
                        if (!rolesRequiringCnpj.includes(v)) setInviteCnpjId("");
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o papel" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.filter(r => r.key !== "OWNER" && r.key !== "PLATFORM_SUPER_ADMIN").map((r) => (
                          <SelectItem key={r.key} value={r.key}>
                            {r.name || r.key}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Seletor de CNPJ - aparece so para papeis que requerem */}
                  {rolesRequiringCnpj.includes(inviteRole) && (
                    <div className="space-y-2">
                      <Label>CNPJ *</Label>
                      <Select value={inviteCnpjId} onValueChange={setInviteCnpjId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione o CNPJ..." />
                        </SelectTrigger>
                        <SelectContent>
                          {cnpjs.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.cnpj} - {c.legal_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {cnpjs.length === 0 && (
                        <p className="text-xs text-amber-600 mt-1">
                          Nenhum CNPJ cadastrado. Cadastre um CNPJ primeiro.
                        </p>
                      )}
                    </div>
                  )}
                  
                  <div className="flex gap-2 justify-end pt-4">
                    <Button variant="outline" onClick={() => {
                      setInviteModalOpen(false);
                      setInviteCnpjId("");
                    }}>
                      Cancelar
                    </Button>
                    <Button onClick={onSendInvitation} disabled={inviteSending}>
                      {inviteSending ? "Enviando..." : "Enviar Convite"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="legal" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Termos e Politica de Privacidade</CardTitle>
                  <CardDescription>Aceite regulatorio obrigatorio para uso da plataforma</CardDescription>
                </div>
                {legal && (
                  <Badge className={legalOk ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"}>
                    {legalOk ? "Aceito" : "Pendente"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {legal ? (
                <>
                  <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Versao dos termos</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{legal.required.terms_version}</span>
                        <a className="text-xs text-primary underline" href={legal.required.terms_url} target="_blank" rel="noreferrer">abrir</a>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Versao da privacidade</span>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{legal.required.privacy_version}</span>
                        <a className="text-xs text-primary underline" href={legal.required.privacy_url} target="_blank" rel="noreferrer">abrir</a>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Aceito em</span>
                      <span className="font-medium">{legal.accepted_at ? new Date(legal.accepted_at).toLocaleString("pt-BR") : "-"}</span>
                    </div>
                  </div>

                  {legal.is_missing && (
                    <Button onClick={onAcceptLegal}>Registrar aceite</Button>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Carregando status...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
