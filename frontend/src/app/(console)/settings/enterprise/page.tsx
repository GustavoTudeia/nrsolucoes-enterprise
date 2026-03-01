"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
    }
  }

  async function onSaveBranding() {
    try {
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
    }
  }

  async function onSaveSso() {
    try {
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

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings Enterprise</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configurações avançadas do tenant: white-label, SSO e gestão de perfis. Algumas opções dependem do plano.
          </p>
        </CardContent>
      </Card>

      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding">White-label</TabsTrigger>
          <TabsTrigger value="privacy">Privacidade</TabsTrigger>
          <TabsTrigger value="sso">SSO (OIDC)</TabsTrigger>
          <TabsTrigger value="roles">Usuários & Perfis</TabsTrigger>
          <TabsTrigger value="legal">Termos</TabsTrigger>
        </TabsList>

        <TabsContent value="branding">
          <Card>
            <CardHeader>
              <CardTitle>White-label / Branding</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da marca</Label>
                  <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Ex: NR Soluções" />
                </div>
                <div className="space-y-2">
                  <Label>Email de suporte</Label>
                  <Input value={supportEmail} onChange={(e) => setSupportEmail(e.target.value)} placeholder="suporte@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label>Logo URL</Label>
                  <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>Background (login) URL</Label>
                  <Input value={loginBg} onChange={(e) => setLoginBg(e.target.value)} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>Cor primária</Label>
                  <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} placeholder="#0f172a" />
                </div>
                <div className="space-y-2">
                  <Label>Cor secundária</Label>
                  <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} placeholder="#22c55e" />
                </div>
                <div className="space-y-2">
                  <Label>Domínio customizado</Label>
                  <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="app.empresa.com" />
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={onSaveBranding} disabled={loading}>
                  Salvar branding
                </Button>
                <span className="text-xs text-muted-foreground">Requer feature WHITE_LABEL (Enterprise).</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Privacidade e anonimização</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 max-w-sm">
                <Label>Limite mínimo de anonimização (min_anon_threshold)</Label>
                <Input value={minAnon} onChange={(e) => setMinAnon(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Define o mínimo de respostas por grupo (por unidade/setor) para liberar agregados (LGPD).
                </p>
              </div>

              <div className="flex gap-2">
                <Button onClick={onSavePrivacy} disabled={loading}>
                  Salvar privacidade
                </Button>
                <span className="text-xs text-muted-foreground">Requer feature ANONYMIZATION.</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sso">
          <Card>
            <CardHeader>
              <CardTitle>Single Sign-On (OIDC)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={ssoEnabled} onChange={(e) => setSsoEnabled(e.target.checked)} />
                <span className="text-sm">Habilitar SSO</span>
              </div>

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
                  <Input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={sso?.has_client_secret ? "(já configurado) - preencha para trocar" : "(não configurado)"} />
                </div>
                <div className="space-y-2">
                  <Label>Domínios permitidos</Label>
                  <Textarea value={allowedDomainsText} onChange={(e) => setAllowedDomainsText(e.target.value)} placeholder="empresa.com\nsubsidiaria.com.br" />
                  <p className="text-xs text-muted-foreground">Um domínio por linha. O login SSO seleciona o tenant pelo domínio do email.</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={onSaveSso} disabled={loading}>
                  Salvar SSO
                </Button>
                <span className="text-xs text-muted-foreground">Requer feature SSO_OIDC (Enterprise).</span>
              </div>

              <Separator />

              <div className="text-sm space-y-1">
                <div>
                  <span className="font-medium">Endpoint start:</span> <code>/api/v1/auth/sso/oidc/start</code>
                </div>
                <div>
                  <span className="font-medium">Endpoint callback:</span> <code>/api/v1/auth/sso/oidc/callback</code>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Usuários & Convites</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Gerencie usuários e envie convites para novos membros
                  </p>
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
                          <select
                            className="border rounded px-2 py-1 text-sm"
                            defaultValue=""
                            onChange={(e) => {
                              const roleKey = e.target.value;
                              if (roleKey) onAssignRole(u.id, roleKey);
                              e.currentTarget.value = "";
                            }}
                          >
                            <option value="">+ Adicionar papel</option>
                            {roles.filter(r => r.key !== "OWNER").map((r) => (
                              <option key={r.key} value={r.key}>
                                {r.name || r.key}
                              </option>
                            ))}
                          </select>
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
                  <div>
                    <Label>Papel *</Label>
                    <select
                      className="w-full border rounded px-3 py-2 text-sm"
                      value={inviteRole}
                      onChange={(e) => {
                        setInviteRole(e.target.value);
                        // Limpa CNPJ se papel não requer
                        if (!rolesRequiringCnpj.includes(e.target.value)) {
                          setInviteCnpjId("");
                        }
                      }}
                    >
                      {roles.filter(r => r.key !== "OWNER" && r.key !== "PLATFORM_SUPER_ADMIN").map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.name || r.key}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Seletor de CNPJ - aparece só para papéis que requerem */}
                  {rolesRequiringCnpj.includes(inviteRole) && (
                    <div>
                      <Label>CNPJ *</Label>
                      <select
                        className="w-full border rounded px-3 py-2 text-sm"
                        value={inviteCnpjId}
                        onChange={(e) => setInviteCnpjId(e.target.value)}
                      >
                        <option value="">Selecione o CNPJ...</option>
                        {cnpjs.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.cnpj} - {c.legal_name}
                          </option>
                        ))}
                      </select>
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

        <TabsContent value="legal">
          <Card>
            <CardHeader>
              <CardTitle>Termos e Política</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {legal ? (
                <>
                  <div className="text-sm space-y-1">
                    <div>
                      <span className="font-medium">Versão termos:</span> {legal.required.terms_version} —{" "}
                      <a className="underline" href={legal.required.terms_url} target="_blank" rel="noreferrer">
                        abrir
                      </a>
                    </div>
                    <div>
                      <span className="font-medium">Versão privacidade:</span> {legal.required.privacy_version} —{" "}
                      <a className="underline" href={legal.required.privacy_url} target="_blank" rel="noreferrer">
                        abrir
                      </a>
                    </div>
                    <div>
                      <span className="font-medium">Aceito em:</span> {legal.accepted_at ? new Date(legal.accepted_at).toLocaleString() : "-"}
                    </div>
                    <div>
                      <span className="font-medium">Status:</span> {legal.is_missing ? "pendente" : "ok"}
                    </div>
                  </div>

                  <Button onClick={onAcceptLegal}>Registrar aceite</Button>
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
