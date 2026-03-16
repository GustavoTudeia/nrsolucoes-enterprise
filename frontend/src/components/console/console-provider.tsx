"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { MeResponse, SubscriptionOut } from "@/lib/api/types";
import { consoleMe, consoleLogout } from "@/lib/api/auth";
import { getSubscription } from "@/lib/api/billing";
import { toast } from "sonner";
import { listCnpjs, listUnits } from "@/lib/api/org";
import type { CNPJOut, OrgUnitOut } from "@/lib/api/types";

type ConsoleScope = {
  cnpjId: string | null;
  orgUnitId: string | null; // null = escopo no nível do CNPJ
  cnpjs: CNPJOut[];
  orgUnits: OrgUnitOut[];
  scopeLoading: boolean;
  setCnpjId: (id: string | null) => void;
  setOrgUnitId: (id: string | null) => void;
  refreshScope: () => Promise<void>;
};

type ConsoleContextValue = {
  me: MeResponse | null;
  subscription: SubscriptionOut | null;
  features: Record<string, any>;
  limits: Record<string, any>;
  featureEnabled: (key: string) => boolean;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  scope: ConsoleScope;
};

export const ConsoleContext = createContext<ConsoleContextValue | undefined>(undefined);

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionOut | null>(null);
  const [loading, setLoading] = useState(true);

  const [cnpjs, setCnpjs] = useState<CNPJOut[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnitOut[]>([]);
  const [cnpjId, _setCnpjId] = useState<string | null>(null);
  const [orgUnitId, _setOrgUnitId] = useState<string | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);

  function setCnpjId(id: string | null) {
    _setCnpjId(id);
    try {
      if (id) localStorage.setItem("nr_scope_cnpj_id", id);
      else localStorage.removeItem("nr_scope_cnpj_id");
    } catch {
      // ignore
    }
  }

  function setOrgUnitId(id: string | null) {
    _setOrgUnitId(id);
    try {
      if (id) localStorage.setItem("nr_scope_org_unit_id", id);
      else localStorage.removeItem("nr_scope_org_unit_id");
    } catch {
      // ignore
    }
  }

  async function refreshScope() {
    if (!me) return;
    setScopeLoading(true);
    try {
      const c = await listCnpjs();
      setCnpjs(c);

      // restore persisted selection if available
      let desiredCnpj: string | null = null;
      let desiredUnit: string | null = null;
      try {
        desiredCnpj = localStorage.getItem("nr_scope_cnpj_id");
        desiredUnit = localStorage.getItem("nr_scope_org_unit_id");
      } catch {
        // ignore
      }

      const resolvedCnpj = (desiredCnpj && c.some((x) => x.id === desiredCnpj)) ? desiredCnpj : (c[0]?.id ?? null);
      _setCnpjId(resolvedCnpj);

      if (resolvedCnpj) {
        const u = await listUnits(resolvedCnpj);
        setOrgUnits(u);
        const resolvedUnit = (desiredUnit && u.some((x) => x.id === desiredUnit)) ? desiredUnit : null;
        _setOrgUnitId(resolvedUnit);
      } else {
        setOrgUnits([]);
        _setOrgUnitId(null);
      }
    } catch {
      setCnpjs([]);
      setOrgUnits([]);
      _setCnpjId(null);
      _setOrgUnitId(null);
    } finally {
      setScopeLoading(false);
    }
  }

  async function refresh() {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([consoleMe(), getSubscription().catch(() => null)]);
      setMe(m);
      setSubscription(s);
    } catch (e: any) {
      setMe(null);
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await consoleLogout();
      toast.success("Sessão encerrada");
      window.location.href = "/login";
    } catch (e: any) {
      toast.error(e?.message || "Falha ao sair");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    // When the session is established/changes, refresh org scope.
    if (me) refreshScope();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  useEffect(() => {
    // When CNPJ changes, refresh its org units.
    (async () => {
      if (!me) return;
      if (!cnpjId) {
        setOrgUnits([]);
        _setOrgUnitId(null);
        return;
      }
      setScopeLoading(true);
      try {
        const u = await listUnits(cnpjId);
        setOrgUnits(u);
        // keep selected unit only if still valid
        if (orgUnitId && !u.some((x) => x.id === orgUnitId)) {
          _setOrgUnitId(null);
        }
      } catch {
        setOrgUnits([]);
      } finally {
        setScopeLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpjId]);

  const scope: ConsoleScope = useMemo(
    () => ({
      cnpjId,
      orgUnitId,
      cnpjs,
      orgUnits,
      scopeLoading,
      setCnpjId,
      setOrgUnitId,
      refreshScope,
    }),
    [cnpjId, orgUnitId, cnpjs, orgUnits, scopeLoading]
  );

  const features = useMemo(() => (subscription?.entitlements_snapshot?.features || {}) as Record<string, any>, [subscription]);
  const limits = useMemo(() => (subscription?.entitlements_snapshot?.limits || {}) as Record<string, any>, [subscription]);
  const featureEnabled = (key: string) => !!features[key];
  const value = useMemo(() => ({ me, subscription, features, limits, featureEnabled, loading, refresh, logout, scope }), [me, subscription, features, limits, loading, scope]);

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole() {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}
