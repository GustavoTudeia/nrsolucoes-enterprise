import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Pega o token do cookie console_token (mesmo usado no login)
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("console_token")?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { detail: "Não autenticado. Faça login novamente." },
        { status: 401 }
      );
    }

    const upstream = await fetch(`${BACKEND_URL}/auth/change-password`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    console.error("[BFF] change-password error:", error);
    return NextResponse.json(
      { detail: "Erro ao alterar senha" },
      { status: 500 }
    );
  }
}