import { NextResponse, type NextRequest } from "next/server";
import { applySession, resolveSession } from "@/libs/server/auth-context";
import { clientIpFrom } from "@/libs/server/backend";

/**
 * GET /api/auth/session — "estou logado?" para componentes client (header,
 * tabela de precos). Renova a sessao se preciso, como qualquer rota /api.
 */
export async function GET(request: NextRequest) {
  const resolved = await resolveSession(
    request.cookies,
    clientIpFrom(request.headers),
  );

  const response = NextResponse.json({
    authenticated: resolved.session !== null,
    role: resolved.session?.role ?? null,
  });

  response.headers.set("Cache-Control", "no-store");
  return applySession(response, resolved);
}
