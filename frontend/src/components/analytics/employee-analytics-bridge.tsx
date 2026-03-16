"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { loadAnalyticsProviders, trackBrowserEvent } from "@/lib/analytics/client";

export function EmployeeAnalyticsBridge() {
  const pathname = usePathname();

  useEffect(() => {
    loadAnalyticsProviders();
    trackBrowserEvent("employee", {
      event_name: "employee_page_viewed",
      source: "employee",
      module: pathname.split("/")[2] || "dashboard",
      properties: { pathname },
    });
  }, [pathname]);

  return null;
}
