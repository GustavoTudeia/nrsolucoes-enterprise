import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set("console_token", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set("console_refresh_token", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
