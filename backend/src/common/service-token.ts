import { timingSafeEqual } from 'node:crypto';

export const SERVICE_TOKEN_HEADER = 'x-service-token';
export const CLIENT_IP_HEADER = 'x-client-ip';

/**
 * Confere o segredo compartilhado que autentica o servidor Next perante esta
 * API.
 *
 * O browser nunca fala direto com o backend: passa pelas rotas /api do Next,
 * que guardam o SERVICE_TOKEN no servidor. E este segredo que permite confiar
 * em cabecalhos como X-Client-IP — sem ele, qualquer um forjaria um IP novo
 * por requisicao e o rate limit deixaria de existir.
 *
 * Falha fechada: sem SERVICE_TOKEN configurado, nada e aceito.
 */
export function isTrustedService(
  header: string | string[] | undefined,
): boolean {
  const expected = process.env.SERVICE_TOKEN;
  const received = Array.isArray(header) ? header[0] : header;

  if (!expected || !received) return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);

  // timingSafeEqual exige tamanhos iguais; comparar o tamanho antes nao vaza
  // nada util, ja que o tamanho do segredo nao e segredo.
  return a.length === b.length && timingSafeEqual(a, b);
}
