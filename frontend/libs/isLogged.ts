/**
 * Checagem de sessao para Client Components (ex.: header, pricing).
 *
 * Pergunta ao BFF em vez de ler cookie: os cookies de sessao sao httpOnly, e
 * so o servidor sabe se o refresh token ainda vale.
 */
export async function isLogged(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) return false;

    const data = (await response.json()) as { authenticated?: boolean };
    return data.authenticated === true;
  } catch {
    return false;
  }
}
