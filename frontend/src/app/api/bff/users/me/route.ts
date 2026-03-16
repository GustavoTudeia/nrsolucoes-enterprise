import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true";

async function refreshConsoleSession(refreshToken: string) {
  const upstream = await fetch(`${BACKEND_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !data?.access_token || !data?.refresh_token) return null;
  return data as { access_token: string; refresh_token: string };
}

async function fetchWithRefresh(method: "GET" | "PATCH", body?: any) {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get("console_token")?.value;
  const refreshToken = cookieStore.get("console_refresh_token")?.value;

  const doCall = async (token?: string | null) => {
    return fetch(`${BACKEND_URL}/users/me`, {
      method,
      headers: {
        ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      ...(method === "PATCH" ? { body: JSON.stringify(body) } : {}),
    });
  };

  let upstream = await doCall(accessToken);
  let refreshed: { access_token: string; refresh_token: string } | null = null;
  if (upstream.status === 401 && refreshToken) {
    refreshed = await refreshConsoleSession(refreshToken);
    if (refreshed) {
      accessToken = refreshed.access_token;
      upstream = await doCall(accessToken);
    }
  }
  const data = await upstream.json().catch(() => ({}));
  const response = NextResponse.json(data, { status: upstream.status });
  if (refreshed) {
    response.cookies.set("console_token", refreshed.access_token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/" });
    response.cookies.set("console_refresh_token", refreshed.refresh_token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/" });
  }
  return response;
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    return await fetchWithRefresh("PATCH", body);
  } catch (error) {
    console.error("[BFF] users/me PATCH error:", error);
    return NextResponse.json({ detail: "Erro ao atualizar perfil" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    return await fetchWithRefresh("GET");
  } catch (error) {
    console.error("[BFF] users/me GET error:", error);
    return NextResponse.json({ detail: "Erro ao buscar perfil" }, { status: 500 });
  }
}
