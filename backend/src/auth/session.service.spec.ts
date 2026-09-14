import { createHash } from 'node:crypto';
import { DeepMockProxy, mock, mockDeep, MockProxy } from 'jest-mock-extended';
import { PrismaService } from 'src/prisma/prisma.service';
import { InvalidTokenException } from './exceptions/token-not-found.exception';
import { ROTATION_GRACE_MS, SessionService } from './session.service';
import { TokenService, TokenType } from './token.service';

const USER = { id: 'user-1', role: 'USER' as const };
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('SessionService', () => {
  let service: SessionService;
  let prisma: DeepMockProxy<PrismaService>;
  let tokenService: MockProxy<TokenService>;

  /** Linha de sessao como o banco devolve, com o usuario incluido. */
  const session = (overrides: Record<string, unknown> = {}) => ({
    id: 'sess-old',
    userId: USER.id,
    tokenHash: sha256('refresh-velho'),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    revokedReason: null,
    createdAt: new Date(),
    user: USER,
    ...overrides,
  });

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    tokenService = mock<TokenService>();
    service = new SessionService(prisma, tokenService);

    tokenService.refreshTtlDays.mockReturnValue(30);
    tokenService.signRefresh.mockResolvedValue('refresh-novo');
    tokenService.signAccess.mockResolvedValue('access-novo');
    tokenService.verify.mockResolvedValue({
      id: USER.id,
      typ: TokenType.Refresh,
      jti: 'jti',
      exp: 0,
    });
    prisma.refreshToken.create.mockResolvedValue({ id: 'sess-new' } as any);
  });

  describe('create', () => {
    it('guarda so o hash do refresh token, nunca o valor', async () => {
      await service.create(USER);

      const { data } = prisma.refreshToken.create.mock.calls[0][0];
      expect(data.tokenHash).toBe(sha256('refresh-novo'));
      expect(JSON.stringify(data)).not.toContain('refresh-novo');
    });

    it('amarra o access token a sessao criada (claim sid)', async () => {
      const tokens = await service.create(USER);

      expect(tokenService.signAccess).toHaveBeenCalledWith(
        USER.id,
        'USER',
        'sess-new',
      );
      expect(tokens).toEqual({
        token: 'access-novo',
        refreshToken: 'refresh-novo',
      });
    });

    it('expira a sessao junto com o refresh token', async () => {
      const before = Date.now();

      await service.create(USER);

      const { data } = prisma.refreshToken.create.mock.calls[0][0];
      const expiresAt = (data.expiresAt as Date).getTime();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      expect(expiresAt).toBeGreaterThanOrEqual(before + thirtyDays);
      expect(expiresAt).toBeLessThanOrEqual(Date.now() + thirtyDays);
    });
  });

  describe('rotate', () => {
    it('recusa assinatura invalida sem consultar o banco', async () => {
      tokenService.verify.mockRejectedValue(new InvalidTokenException());

      await expect(service.rotate('forjado')).rejects.toThrow(
        InvalidTokenException,
      );
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('recusa token que nao corresponde a nenhuma sessao', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.rotate('refresh-velho')).rejects.toThrow(
        InvalidTokenException,
      );
    });

    it('recusa sessao de outro usuario', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        session({ userId: 'outro' }) as any,
      );

      await expect(service.rotate('refresh-velho')).rejects.toThrow(
        InvalidTokenException,
      );
    });

    it('recusa sessao expirada', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        session({ expiresAt: new Date(Date.now() - 1) }) as any,
      );

      await expect(service.rotate('refresh-velho')).rejects.toThrow(
        InvalidTokenException,
      );
    });

    it('revoga a sessao atual como ROTATED e emite um par novo', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(session() as any);

      const tokens = await service.rotate('refresh-velho');

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: sha256('refresh-velho') },
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'sess-old', revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'ROTATED' },
      });
      expect(tokens).toEqual({
        token: 'access-novo',
        refreshToken: 'refresh-novo',
      });
    });

    it('recusa token recem-rotacionado se a sessao terminou depois (logout, troca de senha)', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        session({
          revokedAt: new Date(Date.now() - 1_000),
          revokedReason: 'ROTATED',
        }) as any,
      );
      prisma.refreshToken.count.mockResolvedValue(1);

      await expect(service.rotate('refresh-velho')).rejects.toThrow(
        InvalidTokenException,
      );
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
      expect(prisma.refreshToken.count).toHaveBeenCalledWith({
        where: {
          userId: USER.id,
          revokedAt: { gte: expect.any(Date) },
          revokedReason: { in: ['LOGOUT', 'PASSWORD_CHANGE', 'REUSE'] },
        },
      });
    });

    it('aceita token recem-rotacionado dentro da janela de graca', async () => {
      prisma.refreshToken.count.mockResolvedValue(0);
      prisma.refreshToken.findUnique.mockResolvedValue(
        session({
          revokedAt: new Date(Date.now() - 1_000),
          revokedReason: 'ROTATED',
        }) as any,
      );

      await expect(service.rotate('refresh-velho')).resolves.toEqual({
        token: 'access-novo',
        refreshToken: 'refresh-novo',
      });
      // Nao e reuso: nenhuma sessao cai.
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('trata token rotacionado fora da janela como roubo: derruba tudo', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        session({
          revokedAt: new Date(Date.now() - ROTATION_GRACE_MS - 1_000),
          revokedReason: 'ROTATED',
        }) as any,
      );

      await expect(service.rotate('refresh-velho')).rejects.toThrow(
        InvalidTokenException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: USER.id, revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'REUSE' },
      });
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it.each(['LOGOUT', 'PASSWORD_CHANGE', 'REUSE'])(
      'sessao revogada por %s so recebe 401, sem alarme de roubo',
      async (reason) => {
        prisma.refreshToken.findUnique.mockResolvedValue(
          session({ revokedAt: new Date(), revokedReason: reason }) as any,
        );

        await expect(service.rotate('refresh-velho')).rejects.toThrow(
          InvalidTokenException,
        );
        expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      },
    );
  });

  describe('revogacao', () => {
    it('logout revoga pelo hash e so sessoes ainda ativas', async () => {
      await service.revoke('refresh-velho');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: sha256('refresh-velho'), revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'LOGOUT' },
      });
    });

    it('revokeAllForUser preserva a sessao indicada', async () => {
      await service.revokeAllForUser(USER.id, 'PASSWORD_CHANGE', 'sess-atual');

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          userId: USER.id,
          revokedAt: null,
          id: { not: 'sess-atual' },
        },
        data: { revokedAt: expect.any(Date), revokedReason: 'PASSWORD_CHANGE' },
      });
    });
  });

  describe('cleanupExpired', () => {
    it('apaga sessoes e tokens de uso unico expirados', async () => {
      prisma.$transaction.mockResolvedValue([
        { count: 2 },
        { count: 1 },
      ] as any);

      await service.cleanupExpired();

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
      expect(prisma.usedToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it('engole a falha em vez de derrubar o agendador', async () => {
      prisma.$transaction.mockRejectedValue(new Error('banco fora'));

      await expect(service.cleanupExpired()).resolves.toBeUndefined();
    });
  });
});
