// Resolve a sessao de uma requisicao: usa o access token se ainda vale, senao
// renova com o refresh token. Compartilhado pelo proxy e pelas rotas /api.

import type { NextResponse } from "next/server";
import { refreshSession } from "./backend";
import {
  ACCESS_COOKIE,
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
  verifyAccessToken,
  type Session,
  type Tokens,
} from "./session";

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

export interface ResolvedSession {
  session: Session | null;
  /** Access token a mandar para o backend (o atual ou o recem-emitido). */
  accessToken: string | null;
  /** Par novo emitido nesta requisicao — PRECISA ir para a resposta. */
  rotated: Tokens | null;
  /** O backend recusou a sessao: os cookies devem ser apagados. */
  expired: boolean;
}

export async function resolveSession(
  cookies: CookieReader,
  clientIp: string | null,
): Promise<ResolvedSession> {
  const accessToken = cookies.get(ACCESS_COOKIE)?.value ?? null;
  const session = await verifyAccessToken(accessToken);

  if (session && accessToken) {
    return { session, accessToken, rotated: null, expired: false };
  }

  const refreshToken = cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return {
      session: null,
      accessToken: null,
      rotated: null,
      expired: Boolean(accessToken),
    };
  }

  const result = await refreshSession(refreshToken, clientIp);

  if (result.status === "ok") {
    const renewed = await verifyAccessToken(result.tokens.accessToken);

    if (renewed) {
      return {
        session: renewed,
        accessToken: result.tokens.accessToken,
        rotated: result.tokens,
        expired: false,
      };
    }

    // O backend aceitou e emitiu um token que o front nao consegue validar:
    // quase sempre JWT_SECRET diferente entre os dois lados.
    console.error(
      "Access token recem-emitido nao passou na verificacao: confira se JWT_SECRET e igual no backend e no frontend.",
    );
    return { session: null, accessToken: null, rotated: null, expired: true };
  }

  if (result.status === "invalid") {
    return { session: null, accessToken: null, rotated: null, expired: true };
  }

  // Backend indisponivel: sem sessao nesta requisicao, mas os cookies ficam.
  return { session: null, accessToken: null, rotated: null, expired: false };
}

/** Persiste na resposta o que resolveSession decidiu sobre os cookies. */
export function applySession<T extends NextResponse>(
  res: T,
  resolved: ResolvedSession,
): T {
  if (resolved.rotated) setSessionCookies(res, resolved.rotated);
  else if (resolved.expired) clearSessionCookies(res);
  return res;
}
