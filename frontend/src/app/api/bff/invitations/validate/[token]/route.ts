import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://localhost:8000/api/v1";

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const upstream = await fetch(
      `${BACKEND_BASE_URL}/invitations/validate/${params.token}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }
    );

    const data = await upstream.json().catch(() => ({}));
    return NextResponse.json(data, { status: upstream.status });
  } catch (error) {
    return NextResponse.json(
      { valid: false, message: "Erro ao validar convite", user_exists: false },
      { status: 500 }
    );
  }
}
