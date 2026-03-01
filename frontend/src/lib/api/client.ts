import type { ApiScope, ApiErrorShape } from "@/lib/api/types";

function buildBffUrl(scope: ApiScope, path: string) {
  const clean = path.replace(/^\//, "");
  return `/api/bff/${scope}/${clean}`;
}

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export async function apiFetch<T>(
  scope: ApiScope,
  path: string,
  init?: RequestInit & { parseAs?: "json" | "text" }
): Promise<T> {
  const url = buildBffUrl(scope, path);
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const parseAs = init?.parseAs ?? "json";

  let data: any = null;
  if (parseAs === "json") {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const err = (data || {}) as ApiErrorShape;
    const message = err.detail || `Erro HTTP ${res.status}`;
    throw new ApiError(res.status, message, err.detail);
  }
  return data as T;
}
