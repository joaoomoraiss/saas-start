import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CastAbilityService } from 'src/casl/cast-ability/cast-ability.service';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { PrismaService } from './../prisma/prisma.service';
import { TokenService, TokenType } from './token.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private tokenService: TokenService,
    private prismaService: PrismaService,
    private abilityService: CastAbilityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Invalid token');
    }

    // Aceita exclusivamente tokens de acesso: um token de confirmacao de
    // e-mail ou de reset de senha e rejeitado aqui.
    const payload = await this.tokenService
      .verify(TokenType.Access, token)
      .catch(() => {
        throw new UnauthorizedException('Invalid token');
      });

    // O papel vem do banco, nunca do token: uma mudanca de role tem efeito
    // imediato, sem esperar o token expirar.
    const user = await this.prismaService.user.findUnique({
      where: { id: payload.id },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    if (this.requiresVerifiedEmail() && !user.isVerified) {
      throw new UnauthorizedException('Email not verified');
    }

    request.user = user;
    request.ability = this.abilityService.createForUser(user);

    return true;
  }

  private requiresVerifiedEmail(): boolean {
    return process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
  }
}
