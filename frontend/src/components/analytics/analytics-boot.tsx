"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { getConsent, loadAnalyticsProviders, trackBrowserEvent } from "@/lib/analytics/client";

const PRIVATE_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/billing",
  "/campanhas",
  "/questionarios",
  "/resultados",
  "/inventario",
  "/risco",
  "/plano-acao",
  "/ergonomia",
  "/relatorios",
  "/lms",
  "/auditoria",
  "/esocial",
  "/org",
  "/colaboradores",
  "/settings",
  "/platform",
  "/portal-colaborador",
];

function utmPayload() {
  if (typeof window === "undefined") return {};
  const url = new URL(window.location.href);
  return {
    utm_source: url.searchParams.get("utm_source") || undefined,
    utm_medium: url.searchParams.get("utm_medium") || undefined,
    utm_campaign: url.searchParams.get("utm_campaign") || undefined,
    utm_term: url.searchParams.get("utm_term") || undefined,
    utm_content: url.searchParams.get("utm_content") || undefined,
  };
}

export function AnalyticsBoot() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    if (!getConsent()?.analytics) return;
    loadAnalyticsProviders();
    const isPrivate = PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    if (isPrivate) return;
    trackBrowserEvent("public", {
      event_name: "page_viewed",
      source: "public",
      module: "public",
      properties: { query: search.toString() || undefined },
      ...utmPayload(),
    });
  }, [pathname, search]);

  return null;
}
