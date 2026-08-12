import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { InvalidTokenException } from './exceptions/token-not-found.exception';
import { TokenService, TokenType } from './token.service';

const CONFIG: Record<string, string> = {
  JWT_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  JWT_VERIFY_SECRET: 'c'.repeat(64),
  JWT_FORGOT_SECRET: 'd'.repeat(64),
  ACCESS_TOKEN_TTL: '15m',
  REFRESH_TOKEN_TTL_DAYS: '30',
};

describe('TokenService', () => {
  let service: TokenService;
  let jwtService: JwtService;

  beforeEach(async () => {
    // JwtService real: o valor deste teste esta na volta completa de
    // assinatura e verificacao, nao em confirmar que um mock foi chamado.
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ signOptions: { algorithm: 'HS256' } })],
      providers: [
        TokenService,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => CONFIG[key] },
        },
      ],
    }).compile();

    service = moduleRef.get(TokenService);
    jwtService = moduleRef.get(JwtService);
  });

  describe('separacao por proposito', () => {
    it('aceita o token no proposito para o qual foi emitido', async () => {
      const token = await service.signEmailVerification('user-1');

      const payload = await service.verify(TokenType.EmailVerify, token);

      expect(payload.id).toBe('user-1');
      expect(payload.typ).toBe(TokenType.EmailVerify);
    });

    it.each([
      [TokenType.Access],
      [TokenType.Refresh],
      [TokenType.PasswordReset],
    ])('recusa um token de confirmacao usado como %s', async (type) => {
      const token = await service.signEmailVerification('user-1');

      await expect(service.verify(type, token)).rejects.toThrow(
        InvalidTokenException,
      );
    });

    it('recusa o access token no proposito de reset de senha', async () => {
      const { token } = await service.signAccessPair('user-1', 'USER');

      await expect(
        service.verify(TokenType.PasswordReset, token),
      ).rejects.toThrow(InvalidTokenException);
    });

    it('recusa o refresh token no proposito de acesso', async () => {
      const { refreshToken } = await service.signAccessPair('user-1', 'USER');

      await expect(
        service.verify(TokenType.Access, refreshToken),
      ).rejects.toThrow(InvalidTokenException);
    });

    it('recusa um token cujo claim typ foi forjado', async () => {
      // Mesmo secret do access token, mas typ trocado: sem a conferencia do
      // claim, este token passaria como token de acesso.
      const forjado = await jwtService.signAsync(
        { id: 'user-1', typ: TokenType.EmailVerify },
        { secret: CONFIG.JWT_SECRET, algorithm: 'HS256', expiresIn: '15m' },
      );

      await expect(service.verify(TokenType.Access, forjado)).rejects.toThrow(
        InvalidTokenException,
      );
    });
  });

  describe('verify', () => {
    it('recusa token assinado com outro secret', async () => {
      const token = await jwtService.signAsync(
        { id: 'user-1', typ: TokenType.Access },
        { secret: 'e'.repeat(64), algorithm: 'HS256', expiresIn: '15m' },
      );

      await expect(service.verify(TokenType.Access, token)).rejects.toThrow(
        InvalidTokenException,
      );
    });

    it('recusa token expirado', async () => {
      const token = await jwtService.signAsync(
        { id: 'user-1', typ: TokenType.Access },
        { secret: CONFIG.JWT_SECRET, algorithm: 'HS256', expiresIn: '-1s' },
      );

      await expect(service.verify(TokenType.Access, token)).rejects.toThrow(
        InvalidTokenException,
      );
    });

    it('recusa string que nao e um JWT', async () => {
      await expect(service.verify(TokenType.Access, 'lixo')).rejects.toThrow(
        InvalidTokenException,
      );
    });

    it('recusa token sem assinatura (alg none)', async () => {
      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const body = Buffer.from(
        JSON.stringify({ id: 'user-1', typ: TokenType.Access }),
      ).toString('base64url');

      await expect(
        service.verify(TokenType.Access, `${header}.${body}.`),
      ).rejects.toThrow(InvalidTokenException);
    });
  });

  describe('signAccessPair', () => {
    it('emite tokens diferentes entre si carregando id e papel', async () => {
      const { token, refreshToken } = await service.signAccessPair(
        'user-1',
        'ADMIN',
      );

      expect(token).not.toBe(refreshToken);

      const access = await service.verify(TokenType.Access, token);
      expect(access).toMatchObject({ id: 'user-1', role: 'ADMIN' });
    });
  });

  describe('refreshTtlDays', () => {
    it('usa o valor configurado', () => {
      expect(service.refreshTtlDays()).toBe(30);
    });
  });
});
