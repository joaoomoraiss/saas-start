// Camada mais baixa do BFF: fala com a API NestJS. So roda no servidor (route
// handlers e proxy) — BACKEND_URL e SERVICE_TOKEN nunca chegam ao browser.

import type { Tokens } from "./session";

/** URL da API. Server-side: sem NEXT_PUBLIC, nao entra no bundle. */
export const BACKEND_URL = (
  process.env.BACKEND_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");

const SERVICE_TOKEN = process.env.SERVICE_TOKEN ?? "";

/**
 * Cabecalhos que identificam o Next perante a API.
 *
 * O browser nunca fala direto com o backend, entao para a API todo trafego vem
 * do IP deste servidor. X-Client-IP carrega o IP real do visitante, e o
 * SERVICE_TOKEN e o que faz o backend confiar nele — sem os dois, o rate limit
 * de login vira uma cota unica para o site inteiro.
 */
export function serviceHeaders(clientIp: string | null): Record<string, string> {
  return {
    ...(SERVICE_TOKEN ? { "X-Service-Token": SERVICE_TOKEN } : {}),
    ...(clientIp ? { "X-Client-IP": clientIp } : {}),
  };
}

/**
 * IP do visitante, como informado pelo proxy de borda.
 *
 * X-Real-IP primeiro: Vercel, Cloudflare e um nginx bem configurado o definem
 * sobrescrevendo. O primeiro item de X-Forwarded-For so e confiavel se o proxy
 * da frente SUBSTITUIR o cabecalho — um nginx com $proxy_add_x_forwarded_for
 * concatena, e o cliente consegue injetar um IP falso na primeira posicao.
 * Ver docs/DEPLOY.md.
 */
export function clientIpFrom(headers: Headers): string | null {
  const real = headers.get("x-real-ip");
  if (real) return real.trim();

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return null;
}

/** O backend entrega o refresh token so via Set-Cookie. Extrai o valor. */
export function readRefreshCookie(res: Response): string | null {
  const cookies =
    typeof res.headers.getSetCookie === "function"
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];

  for (const cookie of cookies) {
    const match = /(?:^|;\s*)refreshToken=([^;]+)/.exec(cookie);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }

  return null;
}

export type RefreshResult =
  | { status: "ok"; tokens: Tokens }
  /** O backend recusou: sessao revogada, expirada ou reusada. */
  | { status: "invalid" }
  /** Backend fora do ar, lento ou limitando: a sessao pode estar valida. */
  | { status: "unavailable" };

/**
 * Troca o refresh token por um par novo. O backend ROTACIONA: quem chama
 * precisa gravar o par devolvido, ou a proxima renovacao usa um token ja
 * revogado.
 *
 * "invalid" e "unavailable" sao separados de proposito. Tratar queda do
 * backend como sessao invalida apagaria o cookie de todo mundo logado a cada
 * instabilidade.
 */
export async function refreshSession(
  refreshToken: string,
  clientIp: string | null,
): Promise<RefreshResult> {
  let res: Response;

  try {
    res = await fetch(`${BACKEND_URL}/auth/refresh-token`, {
      method: "POST",
      headers: {
        Cookie: `refreshToken=${encodeURIComponent(refreshToken)}`,
        ...serviceHeaders(clientIp),
      },
      cache: "no-store",
    });
  } catch {
    return { status: "unavailable" };
  }

  if (res.status === 401 || res.status === 400) return { status: "invalid" };
  if (!res.ok) return { status: "unavailable" };

  const body = (await res.json().catch(() => ({}))) as { token?: string };
  const newRefreshToken = readRefreshCookie(res);

  if (!body.token || !newRefreshToken) return { status: "unavailable" };

  return {
    status: "ok",
    tokens: { accessToken: body.token, refreshToken: newRefreshToken },
  };
}
