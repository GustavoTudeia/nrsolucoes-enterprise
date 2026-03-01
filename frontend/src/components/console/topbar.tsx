"use client";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModeToggle } from "@/components/mode-toggle";
import { useConsole } from "@/components/console/console-provider";
import { BrandLogo } from "@/components/brand/logo";
import { Building2, ChevronDown, User } from "lucide-react";

export function ConsoleTopbar() {
  const { me, logout, scope } = useConsole();

  const roleLabel = (() => {
    if (me?.is_platform_admin) return "Platform Admin";
    if (me?.roles?.includes("TENANT_ADMIN")) return "Tenant Admin";
    return me?.roles?.[0] || null;
  })();

  return (
    <header className="sticky top-0 z-40 h-14 border-b bg-background/80 backdrop-blur">
      <div className="flex h-full items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden sm:block">
            <BrandLogo linked={false} markOnly />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold leading-none">Console</div>
              {roleLabel ? (
                <Badge variant="secondary" className="h-5 px-2 text-[10px]">
                  {roleLabel}
                </Badge>
              ) : null}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {me?.full_name ? me.full_name : me?.email ? me.email : "Sessão ativa"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Scope selectors */}
          <div className="hidden items-center gap-2 rounded-2xl border bg-background px-3 py-1.5 shadow-sm md:flex">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">CNPJ</span>
            <select
              className="h-8 rounded-lg border bg-background px-2 text-sm outline-none"
              value={scope.cnpjId || ""}
              onChange={(e) => scope.setCnpjId(e.target.value || null)}
            >
              <option value="">Todos</option>
              {scope.cnpjs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.trade_name || c.legal_name}
                </option>
              ))}
            </select>

            <span className="text-xs text-muted-foreground">Unidade</span>
            <select
              className="h-8 rounded-lg border bg-background px-2 text-sm outline-none"
              value={scope.orgUnitId || ""}
              onChange={(e) => scope.setOrgUnitId(e.target.value || null)}
            >
              <option value="">Todas</option>
              {scope.orgUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          <ModeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <User className="h-4 w-4" />
                <span className="max-w-[140px] truncate">{me?.full_name || me?.email || "Conta"}</span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>{me?.email || "—"}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
