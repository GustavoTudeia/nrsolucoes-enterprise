import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ status: "ok" });
  response.cookies.set("employee_token", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
