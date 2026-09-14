import { NextResponse, type NextRequest } from "next/server";
import { BACKEND_URL, clientIpFrom, serviceHeaders } from "@/libs/server/backend";
import { clearSessionCookies, REFRESH_COOKIE } from "@/libs/server/session";

/**
 * POST /api/auth/logout — revoga a sessao no backend e apaga os cookies.
 *
 * Idempotente: sessao ja morta ou backend fora do ar nao impedem de limpar
 * os cookies. O pior caso e a linha da sessao expirar sozinha no banco.
 */
export async function POST(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (refreshToken) {
    await fetch(`${BACKEND_URL}/auth/logout`, {
      method: "POST",
      headers: {
        Cookie: `refreshToken=${encodeURIComponent(refreshToken)}`,
        ...serviceHeaders(clientIpFrom(request.headers)),
      },
      cache: "no-store",
    }).catch(() => undefined);
  }

  const response = new NextResponse(null, { status: 204 });
  clearSessionCookies(response);
  return response;
}
