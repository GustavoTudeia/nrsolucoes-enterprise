import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true";

type Scope = "public" | "console" | "employee";

function getTokenForScope(req: NextRequest, scope: Scope): string | null {
  if (scope === "console") return req.cookies.get("console_token")?.value || null;
  if (scope === "employee") return req.cookies.get("employee_token")?.value || null;
  return null;
}

function getRefreshTokenForScope(req: NextRequest, scope: Scope): string | null {
  if (scope === "console") return req.cookies.get("console_refresh_token")?.value || null;
  return null;
}

async function doProxy(req: NextRequest, params: { scope: Scope; path: string[] }, overrideToken?: string, body?: ArrayBuffer) {
  const scope = params.scope;
  const token = overrideToken ?? getTokenForScope(req, scope);
  const targetPath = params.path.join("/");
  const url = new URL(req.url);
  const targetUrl = new URL(`${BACKEND_BASE_URL}/${targetPath}`);
  targetUrl.search = url.search;

  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  if (token) headers.set("authorization", `Bearer ${token}`);
  else headers.delete("authorization");

  return fetch(targetUrl.toString(), {
    method: req.method,
    headers,
    body,
    redirect: "manual",
  });
}

async function refreshConsoleAccessToken(req: NextRequest) {
  const refreshToken = getRefreshTokenForScope(req, "console");
  if (!refreshToken) return null;
  const upstream = await fetch(`${BACKEND_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !data?.access_token || !data?.refresh_token) return null;
  return data as { access_token: string; refresh_token: string };
}

async function proxy(req: NextRequest, params: { scope: Scope; path: string[] }) {
  const bodyAllowed = !["GET", "HEAD"].includes(req.method);
  const body = bodyAllowed ? await req.arrayBuffer() : undefined;

  let upstream = await doProxy(req, params, undefined, body);
  let refreshed: { access_token: string; refresh_token: string } | null = null;

  if (upstream.status === 401 && params.scope === "console") {
    refreshed = await refreshConsoleAccessToken(req);
    if (refreshed?.access_token) {
      upstream = await doProxy(req, params, refreshed.access_token, body);
    }
  }

  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("access-control-allow-origin");
  const data = await upstream.arrayBuffer();
  const response = new NextResponse(data, { status: upstream.status, headers: resHeaders });

  if (refreshed) {
    response.cookies.set("console_token", refreshed.access_token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/" });
    response.cookies.set("console_refresh_token", refreshed.refresh_token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/" });
  }

  if (upstream.status === 401 && !refreshed && params.scope === "console") {
    response.cookies.set("console_token", "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/", maxAge: 0 });
    response.cookies.set("console_refresh_token", "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/", maxAge: 0 });
  }

  return response;
}

export async function GET(req: NextRequest, ctx: { params: { scope: Scope; path: string[] } }) {
  return proxy(req, ctx.params);
}
export async function POST(req: NextRequest, ctx: { params: { scope: Scope; path: string[] } }) {
  return proxy(req, ctx.params);
}
export async function PUT(req: NextRequest, ctx: { params: { scope: Scope; path: string[] } }) {
  return proxy(req, ctx.params);
}
export async function PATCH(req: NextRequest, ctx: { params: { scope: Scope; path: string[] } }) {
  return proxy(req, ctx.params);
}
export async function DELETE(req: NextRequest, ctx: { params: { scope: Scope; path: string[] } }) {
  return proxy(req, ctx.params);
}
