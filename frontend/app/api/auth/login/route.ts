import { NextResponse, type NextRequest } from "next/server";
import {
  BACKEND_URL,
  clientIpFrom,
  readRefreshCookie,
  serviceHeaders,
} from "@/libs/server/backend";
import { setSessionCookies } from "@/libs/server/session";

/**
 * POST /api/auth/login — autentica no backend e grava a sessao em cookies
 * httpOnly do dominio do front. Nenhum token volta no corpo: o JavaScript da
 * pagina nao tem motivo para ve-los.
 */
export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Requisição inválida." }, { status: 400 });
  }

  let upstream: Response;

  try {
    upstream = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...serviceHeaders(clientIpFrom(request.headers)),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { message: "Servidor indisponível. Tente novamente." },
      { status: 503 },
    );
  }

  if (!upstream.ok) {
    const error = await upstream.json().catch(() => ({}));
    return NextResponse.json(error, { status: upstream.status });
  }

  const data = (await upstream.json()) as { token?: string };
  const refreshToken = readRefreshCookie(upstream);

  if (!data.token || !refreshToken) {
    return NextResponse.json(
      { message: "Resposta inesperada do servidor de autenticação." },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ ok: true });
  setSessionCookies(response, { accessToken: data.token, refreshToken });
  return response;
}
