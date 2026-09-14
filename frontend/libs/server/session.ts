// Cookies de sessao do BFF. O Next guarda os dois tokens em cookies httpOnly
// do proprio dominio: o JavaScript da pagina nunca ve token nenhum, e o browser
// nao precisa falar com a API em outro dominio.

import { decodeJwt, jwtVerify } from "jose";
import type { NextResponse } from "next/server";

export const ACCESS_COOKIE = "accessToken";
export const REFRESH_COOKIE = "refreshToken";

/** Igual ao REFRESH_TOKEN_TTL_DAYS do backend (default 30). */
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** Roles emitidas pelo backend (enum Role do Prisma — sempre MAIUSCULAS). */
export type Role = "USER" | "ADMIN";

export interface Session {
  userId: string;
  role: Role;
}

const baseCookie = {
  httpOnly: true,
  // NODE_ENV e definido por `next build`/`next start`: em producao o cookie
  // nunca sai sem Secure, mesmo que alguem esqueca uma env no provedor.
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/** Grava (ou regrava, apos rotacao) os cookies de sessao na resposta. */
export function setSessionCookies(res: NextResponse, tokens: Tokens): void {
  let accessMaxAge = 60 * 15;

  try {
    const { exp } = decodeJwt(tokens.accessToken);
    if (exp) accessMaxAge = Math.max(exp - Math.floor(Date.now() / 1000), 0);
  } catch {
    // Mantem o default; a validacao de verdade acontece em verifyAccessToken.
  }

  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie,
    maxAge: accessMaxAge,
  });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie,
    maxAge: REFRESH_MAX_AGE,
  });
}

/** Apaga a sessao (logout, refresh recusado, conta excluida). */
export function clearSessionCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", { ...baseCookie, maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { ...baseCookie, maxAge: 0 });
}

let warnedMissingSecret = false;

/**
 * Valida o access token localmente (assinatura, expiracao e proposito), para o
 * proxy decidir a navegacao sem ir ao backend a cada pagina.
 *
 * Usa JWT_SECRET, o mesmo do backend. O refresh token NAO e validado aqui: se
 * ele ainda vale (revogado? reusado?) quem decide e o banco, via backend.
 */
export async function verifyAccessToken(
  token: string | null | undefined,
): Promise<Session | null> {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    if (!warnedMissingSecret) {
      console.error("JWT_SECRET nao definido no frontend: nenhuma sessao sera aceita.");
      warnedMissingSecret = true;
    }
    return null;
  }

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
    });

    // O backend carimba o proposito em `typ`: um refresh token assinado com
    // outro secret nunca passa, mas a checagem fecha a porta de vez.
    if (payload.typ !== "access" || typeof payload.id !== "string") {
      return null;
    }

    return {
      userId: payload.id,
      role: payload.role === "ADMIN" ? "ADMIN" : "USER",
    };
  } catch {
    // Expirado/adulterado e fluxo normal: o chamador tenta renovar.
    return null;
  }
}
