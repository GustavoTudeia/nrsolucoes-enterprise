import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  const upstream = await fetch(`${BACKEND_BASE_URL}/auth/sso/oidc/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await upstream.json().catch(() => ({}));
  return NextResponse.json(data, { status: upstream.status });
}
