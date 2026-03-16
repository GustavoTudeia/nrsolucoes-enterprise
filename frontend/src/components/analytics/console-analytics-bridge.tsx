"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useConsole } from "@/components/console/console-provider";
import { identifyConsoleUser, loadAnalyticsProviders, trackBrowserEvent } from "@/lib/analytics/client";
import { getTenantHealth } from "@/lib/api/analytics";

export function ConsoleAnalyticsBridge() {
  const pathname = usePathname();
  const { me, subscription } = useConsole();

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!me?.id) return;
      loadAnalyticsProviders();
      let healthBand: string | null = null;
      let healthScore: number | null = null;
      try {
        const health = await getTenantHealth();
        if (mounted) {
          healthBand = health.band;
          healthScore = health.score;
        }
      } catch {}
      identifyConsoleUser({
        userId: me.id,
        tenantId: me.tenant_id,
        role: me.roles?.[0] || null,
        planCode: subscription?.entitlements_snapshot?.plan_key || null,
        healthBand,
        healthScore,
      });
      await trackBrowserEvent("console", {
        event_name: "console_page_viewed",
        source: "console",
        module: pathname.split("/")[1] || "dashboard",
        distinct_key: me.id,
        properties: { pathname },
      });
    })();
    return () => { mounted = false; };
  }, [me?.id, me?.tenant_id, pathname, subscription?.entitlements_snapshot]);

  return null;
}
