import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { isTrustedService, SERVICE_TOKEN_HEADER } from './service-token';

/**
 * Restringe a rota ao servidor Next.
 *
 * Para endpoints que so fazem sentido atras da camada web — o formulario de
 * contato, por exemplo. Aberto, ele vira um relay de e-mail que qualquer um
 * chama direto, sem passar por nenhum controle do frontend.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!isTrustedService(request.headers[SERVICE_TOKEN_HEADER])) {
      throw new UnauthorizedException('Untrusted caller');
    }

    return true;
  }
}
