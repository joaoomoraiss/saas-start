import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { CastAbilityService } from 'src/casl/cast-ability/cast-ability.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthGuard } from './auth.guard';
import { InvalidTokenException } from './exceptions/token-not-found.exception';
import { TokenService, TokenType } from './token.service';

const USER = { id: 'user-1', email: 'a@b.com', role: 'USER', isVerified: true };

function contextFor(request: Record<string, any>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const withBearer = (token: string) => ({
  headers: { authorization: `Bearer ${token}` },
});

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let tokenService: DeepMockProxy<TokenService>;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    tokenService = mockDeep<TokenService>();
    prisma = mockDeep<PrismaService>();
    guard = new AuthGuard(tokenService, prisma, new CastAbilityService());

    tokenService.verify.mockResolvedValue({
      id: USER.id,
      typ: TokenType.Access,
    });
    prisma.user.findUnique.mockResolvedValue(USER as any);
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
  });

  describe('extracao do header', () => {
    it.each([
      ['header ausente', {}],
      ['header vazio', { authorization: '' }],
      ['sem o token', { authorization: 'Bearer' }],
      ['esquema Basic', { authorization: 'Basic abc' }],
      ['sem esquema', { authorization: 'abc' }],
    ])('rejeita %s', async (_caso, headers) => {
      await expect(guard.canActivate(contextFor({ headers }))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('aceita o esquema em caixa alta ou baixa', async () => {
      await expect(
        guard.canActivate(
          contextFor({ headers: { authorization: 'bearer abc' } }),
        ),
      ).resolves.toBe(true);
    });
  });

  it('so aceita token do tipo Access', async () => {
    await guard.canActivate(contextFor(withBearer('abc')));

    expect(tokenService.verify).toHaveBeenCalledWith(TokenType.Access, 'abc');
  });

  it('rejeita quando o token nao passa na verificacao', async () => {
    tokenService.verify.mockRejectedValue(new InvalidTokenException());

    await expect(
      guard.canActivate(contextFor(withBearer('abc'))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejeita token valido de usuario que nao existe mais', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(
      guard.canActivate(contextFor(withBearer('abc'))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('anexa usuario e ability na request', async () => {
    const request = withBearer('abc') as Record<string, any>;

    await guard.canActivate(contextFor(request));

    expect(request.user).toEqual(USER);
    expect(request.ability.can('read', 'User')).toBeDefined();
  });

  // O papel vem do banco, nao do token: revogar um ADMIN tem efeito imediato.
  it('usa o papel do banco, ignorando o que vem no token', async () => {
    tokenService.verify.mockResolvedValue({
      id: USER.id,
      role: 'ADMIN',
      typ: TokenType.Access,
    });
    const request = withBearer('abc') as Record<string, any>;

    await guard.canActivate(contextFor(request));

    expect(request.user.role).toBe('USER');
  });

  describe('REQUIRE_EMAIL_VERIFICATION', () => {
    it('bloqueia usuario nao verificado quando ligado', async () => {
      process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
      prisma.user.findUnique.mockResolvedValue({
        ...USER,
        isVerified: false,
      } as any);

      await expect(
        guard.canActivate(contextFor(withBearer('abc'))),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('permite usuario nao verificado quando desligado', async () => {
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      prisma.user.findUnique.mockResolvedValue({
        ...USER,
        isVerified: false,
      } as any);

      await expect(
        guard.canActivate(contextFor(withBearer('abc'))),
      ).resolves.toBe(true);
    });
  });
});
