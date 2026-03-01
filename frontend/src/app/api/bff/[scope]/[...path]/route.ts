import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true";

type Scope = "public" | "console" | "employee";

function getTokenForScope(scope: Scope): string | null {
  const jar = cookies();
  if (scope === "console") return jar.get("console_token")?.value || null;
  if (scope === "employee") return jar.get("employee_token")?.value || null;
  return null;
}

async function proxy(req: NextRequest, params: { scope: Scope; path: string[] }) {
  const scope = params.scope;
  const token = getTokenForScope(scope);

  const targetPath = params.path.join("/");
  const url = new URL(req.url);
  const targetUrl = new URL(`${BACKEND_BASE_URL}/${targetPath}`);
  targetUrl.search = url.search; // preserve querystring

  const method = req.method;
  const headers = new Headers(req.headers);

  // Remove hop-by-hop and Next-specific headers
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  } else {
    headers.delete("authorization");
  }

  const bodyAllowed = !["GET", "HEAD"].includes(method);
  const body = bodyAllowed ? await req.arrayBuffer() : undefined;

  const upstream = await fetch(targetUrl.toString(), {
    method,
    headers,
    body,
    redirect: "manual",
  });

  const resHeaders = new Headers(upstream.headers);
  // ensure CORS not needed between same-origin (browser talks to Next)
  resHeaders.delete("access-control-allow-origin");

  const data = await upstream.arrayBuffer();

  return new NextResponse(data, {
    status: upstream.status,
    headers: resHeaders,
  });
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
