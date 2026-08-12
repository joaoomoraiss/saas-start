import { ConfigService } from '@nestjs/config';
import { CookieOptions } from 'express';

export const REFRESH_COOKIE = 'refreshToken';

/**
 * Opcoes do cookie de refresh, em um lugar so.
 *
 * `SameSite=None` exige `Secure`, e navegadores descartam o cookie quando um
 * vem sem o outro. Por isso os dois derivam do mesmo booleano de producao.
 */
export function refreshCookieOptions(
  configService: ConfigService,
  ttlDays: number,
): CookieOptions {
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  const cookieDomain = configService.get<string>('COOKIE_DOMAIN');

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: ttlDays * 24 * 60 * 60 * 1000,
    path: '/',
    // Em desenvolvimento o cookie fica no host atual (localhost).
    ...(isProduction && cookieDomain ? { domain: cookieDomain } : {}),
  };
}
