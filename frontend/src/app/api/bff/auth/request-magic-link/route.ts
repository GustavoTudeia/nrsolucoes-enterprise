import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const upstream = await fetch(`${BACKEND_URL}/auth/request-magic-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    console.error("[BFF] request-magic-link error:", error);
    return NextResponse.json(
      { detail: "Erro ao enviar link" },
      { status: 500 }
    );
  }
}