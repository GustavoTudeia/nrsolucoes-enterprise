"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  ListTodo,
  Megaphone,
  Network,
  Settings2,
  ShieldCheck,
  Sliders,
  UserCircle,
  Users,
  Users2,
} from "lucide-react";

import { useConsole } from "@/components/console/console-provider";
import { cn } from "@/lib/utils";

// Papéis do sistema (devem corresponder aos keys no banco)
const ROLES = {
  OWNER: "OWNER",
  TENANT_ADMIN: "TENANT_ADMIN",
  CNPJ_MANAGER: "CNPJ_MANAGER",           // Gestor do CNPJ
  UNIT_MANAGER: "UNIT_MANAGER",           // Gestor de Unidade/Setor
  SECURITY_ANALYST: "SECURITY_ANALYST",   // Analista de Segurança (risks/read)
  EMPLOYEE: "EMPLOYEE",                   // Colaborador (LMS)
  TENANT_AUDITOR: "TENANT_AUDITOR",       // Tenant Auditor (read-only)
  PLATFORM_SUPER_ADMIN: "PLATFORM_SUPER_ADMIN",
} as const;

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  // Quem pode ver este item (vazio = todos autenticados)
  allowedRoles?: string[];
  // Só para platform admin
  platformOnly?: boolean;
  requiredFeature?: string;
};

type NavGroup = {
  label: string;
  items: NavItem[];
  // Quem pode ver este grupo (vazio = todos autenticados)
  allowedRoles?: string[];
};

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard" || href === "/settings") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsoleSidebar() {
  const pathname = usePathname();
  const { me, featureEnabled } = useConsole();

  const userRoles = me?.roles || [];
  const isPlatformAdmin = me?.is_platform_admin || false;

  // Função para verificar se usuário tem permissão
  const hasAccess = (allowedRoles?: string[]): boolean => {
    // Platform admin vê tudo
    if (isPlatformAdmin) return true;
    // Se não há restrição, todos veem
    if (!allowedRoles || allowedRoles.length === 0) return true;
    // Verifica se o usuário tem algum dos papéis permitidos
    return allowedRoles.some((role) => userRoles.includes(role));
  };

  // Papéis administrativos (gerenciam o tenant)
  const adminRoles = [ROLES.OWNER, ROLES.TENANT_ADMIN];

  // Papéis de gestão (gerenciam operações)
  const managementRoles = [...adminRoles, ROLES.CNPJ_MANAGER, ROLES.UNIT_MANAGER, ROLES.SECURITY_ANALYST];

  // Todos os papéis que podem ver dados (incluindo auditor e colaborador)
  const viewerRoles = [...managementRoles, ROLES.TENANT_AUDITOR, ROLES.EMPLOYEE];

  const groups: NavGroup[] = [
    {
      label: "Visão geral",
      items: [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/onboarding", label: "Onboarding", icon: ClipboardList, allowedRoles: [ROLES.OWNER, ROLES.TENANT_ADMIN] },
      ],
    },
    {
      label: "Organização",
      allowedRoles: managementRoles,
      items: [
        { href: "/org/cnpjs", label: "CNPJs", icon: Building2, allowedRoles: adminRoles },
        { href: "/org/unidades", label: "Unidades", icon: Users2, allowedRoles: [...adminRoles, ROLES.CNPJ_MANAGER] },
        { href: "/colaboradores", label: "Colaboradores", icon: Users, allowedRoles: managementRoles },
      ],
    },
    {
      label: "Campanhas & Diagnóstico",
      allowedRoles: [...adminRoles, ROLES.SECURITY_ANALYST, ROLES.CNPJ_MANAGER],
      items: [
        { href: "/campanhas", label: "Campanhas", icon: Megaphone, allowedRoles: [...adminRoles, ROLES.SECURITY_ANALYST], requiredFeature: "CAMPAIGNS" },
        { href: "/questionarios", label: "Questionários", icon: ClipboardList, allowedRoles: [...adminRoles, ROLES.SECURITY_ANALYST], requiredFeature: "QUESTIONNAIRES" },
        { href: "/resultados", label: "Resultados", icon: BarChart3, allowedRoles: viewerRoles, requiredFeature: "REPORTS" },
      ],
    },
    {
      label: "Gestão de Riscos",
      allowedRoles: viewerRoles,
      items: [
        { href: "/inventario", label: "Inventário NR-1", icon: ClipboardList, allowedRoles: viewerRoles, requiredFeature: "RISK_INVENTORY" },
        { href: "/risco", label: "Mapa de Risco", icon: AlertTriangle, allowedRoles: viewerRoles, requiredFeature: "RISK_MAP" },
        { href: "/plano-acao", label: "Plano de Ação", icon: ListTodo, allowedRoles: managementRoles, requiredFeature: "ACTION_PLANS" },
        { href: "/ergonomia", label: "AEP / AET", icon: ClipboardList, allowedRoles: viewerRoles, requiredFeature: "NR17" },
        { href: "/relatorios", label: "Relatórios", icon: FileText, allowedRoles: viewerRoles, requiredFeature: "REPORTS" },
      ],
    },
    {
      label: "Aprendizagem",
      allowedRoles: [...managementRoles, ROLES.EMPLOYEE],
      items: [
        { href: "/lms", label: "LMS", icon: GraduationCap, allowedRoles: [...managementRoles, ROLES.EMPLOYEE], requiredFeature: "LMS" },
      ],
    },
    {
      label: "Governança",
      allowedRoles: [...adminRoles, ROLES.SECURITY_ANALYST, ROLES.TENANT_AUDITOR],
      items: [
        { href: "/auditoria", label: "Auditoria", icon: ShieldCheck, allowedRoles: [...adminRoles, ROLES.TENANT_AUDITOR], requiredFeature: "AUDIT" },
        { href: "/esocial", label: "eSocial SST", icon: FileText, allowedRoles: [...adminRoles, ROLES.SECURITY_ANALYST], requiredFeature: "ESOCIAL_EXPORT" },
      ],
    },
    {
      label: "Conta",
      items: [
        { href: "/settings/perfil", label: "Meu Perfil", icon: UserCircle },
        { href: "/billing", label: "Assinatura", icon: CreditCard, allowedRoles: [ROLES.OWNER] },
        { href: "/settings", label: "Configurações", icon: Settings2, allowedRoles: adminRoles },
        { href: "/settings/enterprise", label: "Enterprise", icon: Sliders, allowedRoles: adminRoles },
      ],
    },
    {
      label: "Suporte",
      items: [
        { href: "/help", label: "Central de Ajuda", icon: LifeBuoy },
      ],
    },
    {
      label: "Plataforma",
      items: [
        { href: "/platform/tenants", label: "Tenants", icon: Building2, platformOnly: true },
        { href: "/platform/planos", label: "Planos", icon: CreditCard, platformOnly: true },
        { href: "/platform/assinaturas", label: "Assinaturas", icon: BarChart3, platformOnly: true },
        { href: "/platform/finance", label: "Financeiro", icon: CreditCard, platformOnly: true },
        { href: "/platform/analytics", label: "Analytics", icon: BarChart3, platformOnly: true },
        { href: "/platform/afiliados", label: "Afiliados", icon: Network, platformOnly: true },
      ],
    },
  ];

  const showItem = (item: NavItem): boolean => {
    // Item só para platform admin
    if (item.platformOnly) {
      return isPlatformAdmin;
    }
    if (item.requiredFeature && !isPlatformAdmin && !featureEnabled(item.requiredFeature)) return false;
    return hasAccess(item.allowedRoles);
  };

  const showGroup = (group: NavGroup): boolean => {
    // Verifica se o grupo tem permissão
    if (!hasAccess(group.allowedRoles)) return false;
    // Verifica se há pelo menos um item visível
    return group.items.some(showItem);
  };

  const visibleGroups = groups
    .filter(showGroup)
    .map((g) => ({ ...g, items: g.items.filter(showItem) }))
    .filter((g) => g.items.length > 0);

  return (
    <aside className="h-full w-64 border-r bg-background overflow-y-auto">
      <div className="px-4 py-4">
        <div className="text-sm font-semibold tracking-tight">Admin Console</div>
        <div className="text-xs text-muted-foreground">NR Soluções · Enterprise</div>
      </div>

      <nav className="space-y-6 px-2 pb-6">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActivePath(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}