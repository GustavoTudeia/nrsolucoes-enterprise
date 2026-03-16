"use client";

import { apiFetch } from "@/lib/api/client";

export type ConsentState = {
  essential: true;
  analytics: boolean;
  updatedAt: string;
};

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    posthog?: any;
    __nrAnalyticsLoaded?: boolean;
  }
}

const CONSENT_KEY = "nr_cookie_consent_v1";

export function getConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    return raw ? (JSON.parse(raw) as ConsentState) : null;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return !!getConsent()?.analytics;
}

export function setConsent(analytics: boolean): ConsentState {
  const next: ConsentState = { essential: true, analytics, updatedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(next));
  }
  return next;
}

function ensureGtag(gaId: string) {
  if (typeof window === "undefined" || !gaId || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: any[]) {
    window.dataLayer?.push(args);
  };
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${gaId}`;
  document.head.appendChild(script);
  window.gtag("js", new Date());
  window.gtag("config", gaId, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: false,
  });
}

function ensurePostHog(posthogKey: string, posthogHost: string) {
  if (typeof window === "undefined" || !posthogKey || window.posthog) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `${posthogHost.replace(/\/$/, "")}/static/array.js`;
  script.onload = () => {
    try {
      window.posthog?.init?.(posthogKey, {
        api_host: posthogHost,
        capture_pageview: false,
        capture_pageleave: true,
        person_profiles: "identified_only",
        autocapture: false,
      });
    } catch {}
  };
  document.head.appendChild(script);
}

export function loadAnalyticsProviders() {
  if (typeof window === "undefined" || window.__nrAnalyticsLoaded || !hasAnalyticsConsent()) return;
  window.__nrAnalyticsLoaded = true;
  const gaId = process.env.NEXT_PUBLIC_GA4_ID || "";
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";
  if (gaId) ensureGtag(gaId);
  if (posthogKey) ensurePostHog(posthogKey, posthogHost);
}

export type AnalyticsScope = "public" | "console" | "employee";

export async function trackBrowserEvent(
  scope: AnalyticsScope,
  payload: {
    event_name: string;
    source?: string;
    module?: string;
    distinct_key?: string;
    path?: string;
    referrer?: string;
    channel?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
    properties?: Record<string, any>;
  }
) {
  const consent = hasAnalyticsConsent();
  if (!consent && scope === "public") return;
  const finalPayload = {
    ...payload,
    path: payload.path || (typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined),
    referrer: payload.referrer || (typeof document !== "undefined" ? document.referrer : undefined),
  };
  try {
    await apiFetch<{ ok: boolean }>(scope === "employee" ? "employee" : scope, scope === "employee" ? "/analytics/employee/browser" : "/analytics/browser", {
      method: "POST",
      body: JSON.stringify(finalPayload),
    });
  } catch {
    // swallow analytics failures
  }

  if (hasAnalyticsConsent()) {
    const gaId = process.env.NEXT_PUBLIC_GA4_ID || "";
    if (gaId && window.gtag) {
      window.gtag("event", finalPayload.event_name, {
        module: finalPayload.module,
        path: finalPayload.path,
        channel: finalPayload.channel,
        ...(finalPayload.properties || {}),
      });
    }
    if (window.posthog?.capture) {
      try {
        window.posthog.capture(finalPayload.event_name, {
          module: finalPayload.module,
          path: finalPayload.path,
          channel: finalPayload.channel,
          ...(finalPayload.properties || {}),
        });
      } catch {}
    }
  }
}

export function identifyConsoleUser(args: { userId: string; tenantId?: string | null; role?: string | null; planCode?: string | null; healthBand?: string | null; healthScore?: number | null }) {
  if (!hasAnalyticsConsent()) return;
  loadAnalyticsProviders();
  try {
    if (window.posthog?.identify) {
      window.posthog.identify(args.userId, {
        role: args.role,
        plan_code: args.planCode,
        health_band: args.healthBand,
        health_score: args.healthScore,
      });
      if (args.tenantId && window.posthog?.group) {
        window.posthog.group("tenant", args.tenantId, {
          plan_code: args.planCode,
          health_band: args.healthBand,
          health_score: args.healthScore,
        });
      }
    }
  } catch {}
}
