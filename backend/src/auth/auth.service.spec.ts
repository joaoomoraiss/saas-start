import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { DeepMockProxy, mock, mockDeep, MockProxy } from 'jest-mock-extended';
import { CaptchaService } from 'src/captcha/captcha.service';
import { MailService } from 'src/mail/mail.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/users/users.service';
import { AuthService } from './auth.service';
import { InvalidTokenException } from './exceptions/token-not-found.exception';
import { UserNotFoundException } from './exceptions/user-not-found.exception';
import { SessionService } from './session.service';
import { TokenService, TokenType } from './token.service';

const PASSWORD = 'Str0ng!Passw0rd';

const CONFIG: Record<string, string> = {
  NODE_ENV: 'test',
  REQUIRE_EMAIL_VERIFICATION: 'false',
};

const payload = (typ: TokenType, id = 'user-1') => ({
  id,
  typ,
  jti: 'jti-1',
  exp: 1_700_000_000,
});

describe('AuthService', () => {
  let service: AuthService;
  let usersService: MockProxy<UsersService>;
  let tokenService: MockProxy<TokenService>;
  let sessionService: MockProxy<SessionService>;
  let mailService: MockProxy<MailService>;
  let captchaService: MockProxy<CaptchaService>;
  let prisma: DeepMockProxy<PrismaService>;
  let res: MockProxy<Response>;
  let user: {
    id: string;
    email: string;
    role: 'USER';
    isVerified: boolean;
    password: string;
  };

  beforeEach(async () => {
    usersService = mock<UsersService>();
    tokenService = mock<TokenService>();
    sessionService = mock<SessionService>();
    mailService = mock<MailService>();
    captchaService = mock<CaptchaService>();
    prisma = mockDeep<PrismaService>();
    res = mock<Response>();

    user = {
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      isVerified: true,
      password: await bcrypt.hash(PASSWORD, 4),
    };

    tokenService.refreshTtlDays.mockReturnValue(30);
    tokenService.signEmailVerification.mockResolvedValue('verify-token');
    tokenService.signPasswordReset.mockResolvedValue('reset-token');
    sessionService.create.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
    });
    captchaService.verify.mockResolvedValue(true);

    service = new AuthService(
      usersService,
      tokenService,
      sessionService,
      { get: (key: string) => CONFIG[key] } as unknown as ConfigService,
      mailService,
      captchaService,
      prisma,
    );
  });

  describe('register', () => {
    it('cria o usuario e envia a confirmacao com o token emitido', async () => {
      usersService.create.mockResolvedValue(user as any);

      const result = await service.register({
        email: user.email,
        password: PASSWORD,
      });

      expect(usersService.create).toHaveBeenCalledWith({
        email: user.email,
        password: PASSWORD,
      });
      expect(mailService.sendUserConfirmation).toHaveBeenCalledWith(
        user.email,
        'verify-token',
      );
      expect(result).toEqual({ id: user.id, email: user.email });
    });

    it('confere o captcha com o token, o IP do cliente e a action de cadastro', async () => {
      usersService.create.mockResolvedValue(user as any);

      await service.register(
        { email: user.email, password: PASSWORD, captchaToken: 'cf-token' },
        '203.0.113.7',
      );

      expect(captchaService.verify).toHaveBeenCalledWith(
        'cf-token',
        '203.0.113.7',
        'register',
      );
    });

    it('nao repassa o token do captcha para a criacao do usuario', async () => {
      usersService.create.mockResolvedValue(user as any);

      await service.register({
        email: user.email,
        password: PASSWORD,
        captchaToken: 'cf-token',
      });

      expect(usersService.create.mock.calls[0][0]).not.toHaveProperty(
        'captchaToken',
      );
    });

    it('recusa com 400 e nao cria nada quando o captcha falha', async () => {
      captchaService.verify.mockResolvedValue(false);

      await expect(
        service.register({ email: user.email, password: PASSWORD }),
      ).rejects.toThrow(BadRequestException);
      expect(usersService.create).not.toHaveBeenCalled();
      expect(mailService.sendUserConfirmation).not.toHaveBeenCalled();
    });

    it('nao devolve o hash da senha', async () => {
      usersService.create.mockResolvedValue(user as any);

      const result = await service.register({
        email: user.email,
        password: PASSWORD,
      });

      expect(result).not.toHaveProperty('password');
    });
  });

  describe('login', () => {
    it('abre uma sessao persistida e grava o refresh no cookie', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(user as any);

      const result = await service.login(
        { email: user.email, password: PASSWORD },
        res,
      );

      expect(sessionService.create).toHaveBeenCalledWith(user);
      expect(result).toEqual({ token: 'access-token' });
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'refresh-token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });

    it('nao devolve o refresh token no corpo', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(user as any);

      const result = await service.login(
        { email: user.email, password: PASSWORD },
        res,
      );

      expect(result).not.toHaveProperty('refreshToken');
    });

    it('rejeita senha errada com 401', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(user as any);

      await expect(
        service.login({ email: user.email, password: 'Wr0ng!Passw0rd' }, res),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('rejeita usuario inexistente com a mesma mensagem', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(null);

      await expect(
        service.login(
          { email: 'ninguem@example.com', password: PASSWORD },
          res,
        ),
      ).rejects.toMatchObject({ status: 401, message: 'Invalid credentials' });
    });

    it('nao abre sessao quando as credenciais falham', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(null);

      await service
        .login({ email: 'ninguem@example.com', password: PASSWORD }, res)
        .catch(() => undefined);

      expect(sessionService.create).not.toHaveBeenCalled();
      expect(res.cookie).not.toHaveBeenCalled();
    });

    it('bloqueia e-mail nao verificado quando a exigencia esta ligada', async () => {
      CONFIG.REQUIRE_EMAIL_VERIFICATION = 'true';
      usersService.findByEmailForAuth.mockResolvedValue({
        ...user,
        isVerified: false,
      } as any);

      await expect(
        service.login({ email: user.email, password: PASSWORD }, res),
      ).rejects.toMatchObject({ status: 401 });

      CONFIG.REQUIRE_EMAIL_VERIFICATION = 'false';
    });
  });

  describe('confirmEmail', () => {
    it('marca como verificado apos validar o token de confirmacao', async () => {
      tokenService.verify.mockResolvedValue(payload(TokenType.EmailVerify));
      usersService.findOne.mockResolvedValue(user as any);

      await service.confirmEmail('verify-token');

      expect(tokenService.verify).toHaveBeenCalledWith(
        TokenType.EmailVerify,
        'verify-token',
      );
      expect(usersService.markAsVerified).toHaveBeenCalledWith(user.id);
    });

    it('propaga token invalido sem tocar no banco', async () => {
      tokenService.verify.mockRejectedValue(new InvalidTokenException());

      await expect(service.confirmEmail('lixo')).rejects.toThrow(
        InvalidTokenException,
      );
      expect(usersService.markAsVerified).not.toHaveBeenCalled();
    });

    it('falha quando o usuario do token nao existe mais', async () => {
      tokenService.verify.mockResolvedValue(
        payload(TokenType.EmailVerify, 'sumiu'),
      );
      usersService.findOne.mockRejectedValue(new Error('not found'));

      await expect(service.confirmEmail('verify-token')).rejects.toThrow(
        UserNotFoundException,
      );
    });
  });

  describe('verifyEmail', () => {
    it('reenvia a confirmacao para usuario pendente', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...user,
        isVerified: false,
      } as any);

      await service.verifyEmail(user.email);

      expect(mailService.sendUserConfirmation).toHaveBeenCalled();
    });

    it('nao reenvia para usuario ja verificado', async () => {
      usersService.findByEmail.mockResolvedValue(user as any);

      await service.verifyEmail(user.email);

      expect(mailService.sendUserConfirmation).not.toHaveBeenCalled();
    });

    // Silencio deliberado: responder diferente revelaria quem tem cadastro.
    it('nao lanca erro para e-mail desconhecido', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.verifyEmail('ninguem@example.com'),
      ).resolves.toBeUndefined();
      expect(mailService.sendUserConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('envia o link de reset para usuario existente', async () => {
      usersService.findByEmail.mockResolvedValue(user as any);

      await service.forgotPassword(user.email);

      expect(mailService.sendPasswordReset).toHaveBeenCalledWith(
        user.email,
        'reset-token',
      );
    });

    it('nao revela ausencia de cadastro', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword('ninguem@example.com'),
      ).resolves.toBeUndefined();
      expect(mailService.sendPasswordReset).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    beforeEach(() => {
      tokenService.verify.mockResolvedValue(payload(TokenType.PasswordReset));
      usersService.findOne.mockResolvedValue(user as any);
      usersService.hashPassword.mockResolvedValue('novo-hash');
      prisma.$transaction.mockResolvedValue([] as any);
    });

    it('consome o jti e grava a senha na mesma transacao', async () => {
      await service.resetPassword('reset-token', 'N3w!Passw0rd');

      expect(tokenService.verify).toHaveBeenCalledWith(
        TokenType.PasswordReset,
        'reset-token',
      );
      expect(prisma.usedToken.create).toHaveBeenCalledWith({
        data: { jti: 'jti-1', expiresAt: new Date(1_700_000_000 * 1000) },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { password: 'novo-hash' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('derruba todas as sessoes do usuario', async () => {
      await service.resetPassword('reset-token', 'N3w!Passw0rd');

      expect(sessionService.revokeAllForUser).toHaveBeenCalledWith(
        user.id,
        'PASSWORD_CHANGE',
      );
    });

    it('recusa link ja usado (jti duplicado) sem derrubar sessoes', async () => {
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.resetPassword('reset-token', 'N3w!Passw0rd'),
      ).rejects.toThrow(InvalidTokenException);
      expect(sessionService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('propaga falhas de banco que nao sao duplicidade', async () => {
      prisma.$transaction.mockRejectedValue(new Error('conexao caiu'));

      await expect(
        service.resetPassword('reset-token', 'N3w!Passw0rd'),
      ).rejects.toThrow('conexao caiu');
    });

    it('nao altera nada quando o token e invalido', async () => {
      tokenService.verify.mockRejectedValue(new InvalidTokenException());

      await expect(
        service.resetPassword('lixo', 'N3w!Passw0rd'),
      ).rejects.toThrow(InvalidTokenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    const requestWith = (cookies: Record<string, string> | undefined) =>
      ({ cookies }) as unknown as Request;

    it('rotaciona a sessao e grava o novo refresh no cookie', async () => {
      sessionService.rotate.mockResolvedValue({
        token: 'novo-access',
        refreshToken: 'novo-refresh',
      });

      const result = await service.refreshToken(
        requestWith({ refreshToken: 'refresh-token' }),
        res,
      );

      expect(sessionService.rotate).toHaveBeenCalledWith('refresh-token');
      expect(result).toEqual({ token: 'novo-access' });
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'novo-refresh',
        expect.objectContaining({ httpOnly: true }),
      );
    });

    it('rejeita requisicao sem cookie', async () => {
      await expect(
        service.refreshToken(requestWith(undefined), res),
      ).rejects.toThrow(InvalidTokenException);
      expect(sessionService.rotate).not.toHaveBeenCalled();
    });

    it('propaga a recusa da sessao sem gravar cookie', async () => {
      sessionService.rotate.mockRejectedValue(new InvalidTokenException());

      await expect(
        service.refreshToken(requestWith({ refreshToken: 'velho' }), res),
      ).rejects.toThrow(InvalidTokenException);
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revoga a sessao no banco e limpa o cookie', async () => {
      await service.logout(
        { cookies: { refreshToken: 'refresh-token' } } as unknown as Request,
        res,
      );

      expect(sessionService.revoke).toHaveBeenCalledWith('refresh-token');
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });

    it('sem cookie so limpa, sem erro', async () => {
      await service.logout({ cookies: {} } as unknown as Request, res);

      expect(sessionService.revoke).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });
});
