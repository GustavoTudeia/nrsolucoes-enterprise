import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";
const COOKIE_SECURE = (process.env.COOKIE_SECURE || "false") === "true";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const body = await req.json();
    
    const upstream = await fetch(
      `${BACKEND_BASE_URL}/invitations/accept/${params.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await upstream.json().catch(() => ({}));
    
    if (!upstream.ok) {
      return NextResponse.json(data, { status: upstream.status });
    }

    // Se retornou token, salva no cookie
    const token = data?.access_token;
    if (token) {
      const cookieStore = await cookies();
      cookieStore.set("console_token", token, {
        httpOnly: true,
        secure: COOKIE_SECURE,
        sameSite: "lax",
        path: "/",
      });

      if (data?.refresh_token) {
        cookieStore.set("console_refresh_token", data.refresh_token, {
          httpOnly: true,
          secure: COOKIE_SECURE,
          sameSite: "lax",
          path: "/",
        });
      }
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { detail: "Erro ao aceitar convite" },
      { status: 500 }
    );
  }
}
