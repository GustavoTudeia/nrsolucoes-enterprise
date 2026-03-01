"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  UserPlus,
  Mail,
  CreditCard,
  Shield,
  Search,
  MoreVertical,
  Check,
  X,
  Clock,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/api/client";

interface UserListItem {
  id: string;
  email: string | null;
  cpf: string | null;
  full_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
  roles: string[];
  invited_by_name: string | null;
  created_at: string;
}

interface Invitation {
  id: string;
  email: string;
  full_name: string | null;
  role_key: string;
  role_name: string;
  status: string;
  invited_by_name: string;
  expires_at: string;
  created_at: string;
}

interface Role {
  key: string;
  name: string;
  description: string | null;
}

export default function UsuariosPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"users" | "invitations">("users");

  // Modal de convite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("TENANT_ADMIN");
  const [inviteLoading, setInviteLoading] = useState(false);

  // Carregar dados
  useEffect(() => {
    loadData();
  }, [page, search]);

  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, invitationsRes, rolesRes] = await Promise.all([
        apiFetch<{ items: UserListItem[]; total: number }>(
          "console",
          `/users?limit=20&offset=${page * 20}${search ? `&q=${encodeURIComponent(search)}` : ""}`
        ),
        apiFetch<{ items: Invitation[]; total: number }>("console", "/invitations?status=pending"),
        apiFetch<Role[]>("console", "/users/roles"),
      ]);

      setUsers(usersRes.items);
      setTotal(usersRes.total);
      setInvitations(invitationsRes.items);
      setRoles(rolesRes);
    } catch (err: any) {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast.error("Informe o email");
      return;
    }

    setInviteLoading(true);
    try {
      await apiFetch("console", "/invitations", {
        method: "POST",
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteName || null,
          role_key: inviteRole,
          expires_days: 7,
        }),
      });
      toast.success("Convite enviado com sucesso!");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("TENANT_ADMIN");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar convite");
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleDeactivateUser(userId: string) {
    if (!confirm("Deseja desativar este usuário?")) return;
    try {
      await apiFetch("console", `/users/${userId}/deactivate`, { method: "POST" });
      toast.success("Usuário desativado");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao desativar usuário");
    }
  }

  async function handleReactivateUser(userId: string) {
    try {
      await apiFetch("console", `/users/${userId}/reactivate`, { method: "POST" });
      toast.success("Usuário reativado");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao reativar usuário");
    }
  }

  async function handleResetPassword(userId: string) {
    try {
      await apiFetch("console", `/users/${userId}/reset-password`, { method: "POST" });
      toast.success("Email de recuperação enviado");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar email");
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    if (!confirm("Cancelar este convite?")) return;
    try {
      await apiFetch("console", `/invitations/${invitationId}`, { method: "DELETE" });
      toast.success("Convite cancelado");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar convite");
    }
  }

  async function handleResendInvitation(invitationId: string) {
    try {
      await apiFetch("console", `/invitations/${invitationId}/resend`, { method: "POST" });
      toast.success("Convite reenviado");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao reenviar convite");
    }
  }

  function formatDate(date: string | null) {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatDateTime(date: string | null) {
    if (!date) return "Nunca";
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "Hoje";
    if (days === 1) return "Ontem";
    if (days < 7) return `${days} dias atrás`;
    return d.toLocaleDateString("pt-BR");
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Usuários
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie usuários e convites de acesso à plataforma
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Convidar usuário
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 border-b">
        <button
          onClick={() => setActiveTab("users")}
          className={`pb-3 px-1 text-sm font-medium transition-colors ${
            activeTab === "users"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Usuários ({total})
        </button>
        <button
          onClick={() => setActiveTab("invitations")}
          className={`pb-3 px-1 text-sm font-medium transition-colors flex items-center gap-2 ${
            activeTab === "invitations"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Convites pendentes
          {invitations.length > 0 && (
            <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
              {invitations.length}
            </span>
          )}
        </button>
      </div>

      {/* Busca */}
      {activeTab === "users" && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou CPF..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-background text-sm"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : activeTab === "users" ? (
        <Card>
          <div className="divide-y">
            {users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {search ? "Nenhum usuário encontrado" : "Nenhum usuário cadastrado"}
              </div>
            ) : (
              users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                  <div className="flex items-center gap-4">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium ${
                        user.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {(user.full_name || user.email || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {user.full_name || "Sem nome"}
                        {!user.is_active && (
                          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">
                            Inativo
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-3">
                        {user.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                          </span>
                        )}
                        {user.cpf && (
                          <span className="flex items-center gap-1">
                            <CreditCard className="h-3 w-3" />
                            {user.cpf}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right text-sm">
                      <div className="text-muted-foreground">Papéis</div>
                      <div className="flex gap-1 mt-1">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="text-right text-sm">
                      <div className="text-muted-foreground">Último acesso</div>
                      <div className="flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3 text-muted-foreground" />
                        {formatDateTime(user.last_login_at)}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/settings/usuarios/${user.id}`)}>
                          Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResetPassword(user.id)}>
                          Enviar reset de senha
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {user.is_active ? (
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => handleDeactivateUser(user.id)}
                          >
                            Desativar usuário
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleReactivateUser(user.id)}>
                            Reativar usuário
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Paginação */}
          {total > 20 && (
            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-sm text-muted-foreground">
                Mostrando {page * 20 + 1} a {Math.min((page + 1) * 20, total)} de {total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * 20 >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {invitations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Nenhum convite pendente
              </div>
            ) : (
              invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-4 hover:bg-muted/50">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-medium">{inv.email}</div>
                      <div className="text-sm text-muted-foreground">
                        Papel: {inv.role_name} • Convidado por {inv.invited_by_name}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <div className="text-muted-foreground">Expira em</div>
                      <div>{formatDate(inv.expires_at)}</div>
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleResendInvitation(inv.id)}>
                        <RefreshCw className="h-4 w-4 mr-1" />
                        Reenviar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                        onClick={() => handleCancelInvitation(inv.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Modal de Convite */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar novo usuário</DialogTitle>
            <DialogDescription>
              O usuário receberá um email com link para criar sua conta e acessar a plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Email *</label>
              <input
                type="email"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="usuario@empresa.com"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Nome (opcional)</label>
              <input
                type="text"
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Nome completo"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Papel *</label>
              <select
                className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {roles
                  .filter((r) => r.key !== "OWNER" && r.key !== "PLATFORM_SUPER_ADMIN")
                  .map((role) => (
                    <option key={role.key} value={role.key}>
                      {role.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={inviteLoading}>
              {inviteLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Enviar convite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
