import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Pega o token do cookie console_token
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("console_token")?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { detail: "Não autenticado" },
        { status: 401 }
      );
    }

    const upstream = await fetch(`${BACKEND_URL}/users/me`, {
      method: "PATCH",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    console.error("[BFF] users/me PATCH error:", error);
    return NextResponse.json(
      { detail: "Erro ao atualizar perfil" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Pega o token do cookie console_token
    const cookieStore = await cookies();
    const accessToken = cookieStore.get("console_token")?.value;
    
    if (!accessToken) {
      return NextResponse.json(
        { detail: "Não autenticado" },
        { status: 401 }
      );
    }

    const upstream = await fetch(`${BACKEND_URL}/users/me`, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${accessToken}`,
      },
    });

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    console.error("[BFF] users/me GET error:", error);
    return NextResponse.json(
      { detail: "Erro ao buscar perfil" },
      { status: 500 }
    );
  }
}