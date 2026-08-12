import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request';

/**
 * Exige e-mail confirmado na rota, independente de REQUIRE_EMAIL_VERIFICATION.
 *
 * Aquele flag existe para o desenvolvimento sem SMTP configurado e afrouxa o
 * login inteiro. Rotas que movimentam dinheiro ou dados sensiveis nao podem
 * depender de um flag de conveniencia: aqui a exigencia e sempre.
 *
 * Roda sempre DEPOIS do AuthGuard, que e quem popula request.user.
 */
@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    // Sem AuthGuard antes deste guard nao ha usuario: nega em vez de estourar.
    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Email not verified');
    }

    return true;
  }
}
