import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true";

export async function GET(_req: NextRequest, ctx: { params: { token: string } }) {
  const token = ctx.params.token;
  const upstream = await fetch(`${BACKEND_BASE_URL}/employee/auth/magic/${encodeURIComponent(token)}`, {
    method: "GET",
  });
  const data = await upstream.json().catch(() => ({}));

  const response = NextResponse.json(data, { status: upstream.status });

  if (upstream.ok && data?.access_token) {
    response.cookies.set("employee_token", data.access_token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
    });
  }

  return response;
}
