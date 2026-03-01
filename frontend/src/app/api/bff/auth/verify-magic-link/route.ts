import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { detail: "Token não informado" },
        { status: 400 }
      );
    }

    const upstream = await fetch(`${BACKEND_URL}/auth/verify-magic-link?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const data = await upstream.json().catch(() => ({}));
    
    if (!upstream.ok) {
      return NextResponse.json(data, { status: upstream.status });
    }

    // Login bem-sucedido - salvar token no cookie (mesmo padrão do login normal)
    const accessToken = data?.access_token;
    if (!accessToken) {
      return NextResponse.json({ detail: "Token não retornado" }, { status: 500 });
    }

    const cookieStore = await cookies();
    cookieStore.set("console_token", accessToken, {
      httpOnly: true,
      secure: COOKIE_SECURE,
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("[BFF] verify-magic-link error:", error);
    return NextResponse.json(
      { detail: "Erro ao verificar link" },
      { status: 500 }
    );
  }
}