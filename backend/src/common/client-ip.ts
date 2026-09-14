import type { Request } from 'express';
import {
  CLIENT_IP_HEADER,
  isTrustedService,
  SERVICE_TOKEN_HEADER,
} from './service-token';

/**
 * IP do cliente original, para rate limit e captcha.
 *
 * Atras do Next, `req.ip` e o endereco do servidor Next para TODA requisicao
 * do sistema — um limite de 10 logins por minuto viraria 10 por minuto no
 * site inteiro, e um atacante derrubaria o login de todo mundo. Por isso o
 * Next repassa o IP real em X-Client-IP.
 *
 * Esse cabecalho so vale acompanhado de um SERVICE_TOKEN valido. Sem a
 * conferencia ele e forjavel, e o rate limit fica pior do que inutil.
 */
export function clientIp(req: Request): string {
  if (isTrustedService(req.headers[SERVICE_TOKEN_HEADER])) {
    const forwarded = req.headers[CLIENT_IP_HEADER];
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (ip) return ip;
  }

  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
