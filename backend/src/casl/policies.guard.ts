import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { CHECK_POLICIES_KEY, PolicyHandler } from './policies.decorator';

@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handlers =
      this.reflector.get<PolicyHandler[]>(
        CHECK_POLICIES_KEY,
        context.getHandler(),
      ) ?? [];

    if (!handlers.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Preenchido pelo AuthGuard. Ausente significa que este guard foi usado
    // sem o AuthGuard antes dele: nega, em vez de liberar por omissao.
    if (!request.ability) {
      throw new ForbiddenException('Access denied');
    }

    if (!handlers.every((handler) => handler(request.ability, request))) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
