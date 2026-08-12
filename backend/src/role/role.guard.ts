import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { Role } from 'generated/prisma/enums';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<Role[]>(
      'roles',
      context.getHandler(),
    );

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authUser = request.user;

    // Sem AuthGuard antes deste guard nao ha usuario: nega em vez de estourar.
    if (!authUser) {
      throw new UnauthorizedException('Invalid token');
    }

    // ADMIN passa em qualquer exigencia de papel.
    if (
      authUser.role !== Role.ADMIN &&
      !requiredRoles.includes(authUser.role)
    ) {
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
