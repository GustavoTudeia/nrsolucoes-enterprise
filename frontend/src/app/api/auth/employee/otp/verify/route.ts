import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true";

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const upstream = await fetch(`${BACKEND_BASE_URL}/employee/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await upstream.json().catch(() => ({}));

  if (upstream.ok && data?.access_token) {
    cookies().set("employee_token", data.access_token, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
    });
  }
  return NextResponse.json(data, { status: upstream.status });
}
