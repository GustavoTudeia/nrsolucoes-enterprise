import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    
    if (!token) {
      return NextResponse.json({ valid: false, message: "Token não informado" });
    }

    const upstream = await fetch(
      `${BACKEND_URL}/auth/validate-reset-token?token=${encodeURIComponent(token)}`,
      { method: "GET" }
    );

    const data = await upstream.json().catch(() => ({ valid: false }));
    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    return NextResponse.json({ valid: false, message: "Erro ao validar token" });
  }
}
