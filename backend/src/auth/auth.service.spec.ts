import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { MailService } from 'src/mail/mail.service';
import { UsersService } from 'src/users/users.service';
import { AuthService } from './auth.service';
import { InvalidTokenException } from './exceptions/token-not-found.exception';
import { UserNotFoundException } from './exceptions/user-not-found.exception';
import { TokenService, TokenType } from './token.service';

const PASSWORD = 'Str0ng!Passw0rd';

const CONFIG: Record<string, string> = {
  NODE_ENV: 'test',
  REQUIRE_EMAIL_VERIFICATION: 'false',
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: MockProxy<UsersService>;
  let tokenService: MockProxy<TokenService>;
  let mailService: MockProxy<MailService>;
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
    mailService = mock<MailService>();
    res = mock<Response>();

    user = {
      id: 'user-1',
      email: 'user@example.com',
      role: 'USER',
      isVerified: true,
      password: await bcrypt.hash(PASSWORD, 4),
    };

    tokenService.refreshTtlDays.mockReturnValue(30);
    tokenService.signAccessPair.mockResolvedValue({
      token: 'access-token',
      refreshToken: 'refresh-token',
    });
    tokenService.signEmailVerification.mockResolvedValue('verify-token');
    tokenService.signPasswordReset.mockResolvedValue('reset-token');

    service = new AuthService(
      usersService,
      tokenService,
      { get: (key: string) => CONFIG[key] } as unknown as ConfigService,
      mailService,
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
    it('devolve o access token e grava o refresh no cookie', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(user as any);

      const result = await service.login(
        { email: user.email, password: PASSWORD },
        res,
      );

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

    it('nao emite token quando as credenciais falham', async () => {
      usersService.findByEmailForAuth.mockResolvedValue(null);

      await service
        .login({ email: 'ninguem@example.com', password: PASSWORD }, res)
        .catch(() => undefined);

      expect(tokenService.signAccessPair).not.toHaveBeenCalled();
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
      tokenService.verify.mockResolvedValue({
        id: user.id,
        typ: TokenType.EmailVerify,
      });
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
      tokenService.verify.mockResolvedValue({
        id: 'sumiu',
        typ: TokenType.EmailVerify,
      });
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
    it('grava a nova senha apos validar o token de reset', async () => {
      tokenService.verify.mockResolvedValue({
        id: user.id,
        typ: TokenType.PasswordReset,
      });
      usersService.findOne.mockResolvedValue(user as any);

      await service.resetPassword('reset-token', 'N3w!Passw0rd');

      expect(tokenService.verify).toHaveBeenCalledWith(
        TokenType.PasswordReset,
        'reset-token',
      );
      expect(usersService.setPassword).toHaveBeenCalledWith(
        user.id,
        'N3w!Passw0rd',
      );
    });

    it('nao altera a senha quando o token e invalido', async () => {
      tokenService.verify.mockRejectedValue(new InvalidTokenException());

      await expect(
        service.resetPassword('lixo', 'N3w!Passw0rd'),
      ).rejects.toThrow(InvalidTokenException);
      expect(usersService.setPassword).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    const requestWith = (cookies: Record<string, string> | undefined) =>
      ({ cookies }) as any;

    it('emite novo par a partir do cookie valido', async () => {
      tokenService.verify.mockResolvedValue({
        id: user.id,
        typ: TokenType.Refresh,
      });
      usersService.findOne.mockResolvedValue(user as any);

      const result = await service.refreshToken(
        requestWith({ refreshToken: 'refresh-token' }),
        res,
      );

      expect(result).toEqual({ token: 'access-token' });
      expect(res.cookie).toHaveBeenCalled();
    });

    it('rejeita requisicao sem cookie', async () => {
      await expect(
        service.refreshToken(requestWith(undefined), res),
      ).rejects.toThrow(InvalidTokenException);
    });

    it('rejeita cookie que nao e refresh token', async () => {
      tokenService.verify.mockRejectedValue(new InvalidTokenException());

      await expect(
        service.refreshToken(
          requestWith({ refreshToken: 'access-token' }),
          res,
        ),
      ).rejects.toThrow(InvalidTokenException);
    });

    it('rejeita refresh de usuario removido', async () => {
      tokenService.verify.mockResolvedValue({
        id: user.id,
        typ: TokenType.Refresh,
      });
      usersService.findOne.mockRejectedValue(new Error('not found'));

      await expect(
        service.refreshToken(
          requestWith({ refreshToken: 'refresh-token' }),
          res,
        ),
      ).rejects.toThrow(InvalidTokenException);
    });
  });

  describe('logout', () => {
    it('limpa o cookie de refresh', () => {
      service.logout(res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'refreshToken',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
    });
  });
});
