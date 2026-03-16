import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true";

export async function POST(req: NextRequest) {
  const accessToken = req.cookies.get("console_token")?.value;
  const refreshToken = req.cookies.get("console_refresh_token")?.value;

  if (accessToken) {
    try {
      await fetch(`${BACKEND_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          ...(refreshToken ? { "X-Refresh-Token": refreshToken } : {}),
        },
      });
    } catch {}
  }

  const response = NextResponse.json({ status: "ok" });
  response.cookies.set("console_token", "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set("console_refresh_token", "", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
