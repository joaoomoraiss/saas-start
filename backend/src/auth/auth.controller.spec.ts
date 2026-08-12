import { Test } from '@nestjs/testing';
import { Request, Response } from 'express';
import { mock, MockProxy } from 'jest-mock-extended';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * O controller e uma casca fina: delega e nao decide. Estes testes fixam o
 * contrato de delegacao. As respostas HTTP em si (status, cookies, validacao)
 * sao cobertas por test/auth.e2e-spec.ts, onde o pipeline e o real.
 */
describe('AuthController', () => {
  let controller: AuthController;
  let authService: MockProxy<AuthService>;
  let res: MockProxy<Response>;

  beforeEach(async () => {
    authService = mock<AuthService>();
    res = mock<Response>();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = moduleRef.get(AuthController);
  });

  it('register delega o DTO ao service', async () => {
    const dto = { email: 'a@b.com', password: 'Str0ng!Passw0rd' };
    authService.register.mockResolvedValue({ id: 'user-1', email: dto.email });

    await expect(controller.register(dto)).resolves.toEqual({
      id: 'user-1',
      email: dto.email,
    });
    expect(authService.register).toHaveBeenCalledWith(dto);
  });

  it('login repassa a resposta para o service gravar o cookie', async () => {
    const dto = { email: 'a@b.com', password: 'Str0ng!Passw0rd' };
    authService.login.mockResolvedValue({ token: 'access-token' });

    await expect(controller.login(dto, res)).resolves.toEqual({
      token: 'access-token',
    });
    expect(authService.login).toHaveBeenCalledWith(dto, res);
  });

  it('confirm extrai o token do corpo', async () => {
    await controller.confirmEmail({ token: 'verify-token' });

    expect(authService.confirmEmail).toHaveBeenCalledWith('verify-token');
  });

  it('verify-email extrai o e-mail do corpo', async () => {
    await controller.verifyEmail({ email: 'a@b.com' });

    expect(authService.verifyEmail).toHaveBeenCalledWith('a@b.com');
  });

  it('forgot-password extrai o e-mail do corpo', async () => {
    await controller.forgotPassword({ email: 'a@b.com' });

    expect(authService.forgotPassword).toHaveBeenCalledWith('a@b.com');
  });

  it('reset-password repassa token e nova senha', async () => {
    await controller.resetPassword({
      token: 'reset-token',
      newPassword: 'N3w!Passw0rd',
    });

    expect(authService.resetPassword).toHaveBeenCalledWith(
      'reset-token',
      'N3w!Passw0rd',
    );
  });

  it('refresh-token repassa request e response', async () => {
    const req = mock<Request>();
    authService.refreshToken.mockResolvedValue({ token: 'access-token' });

    await expect(controller.refreshToken(req, res)).resolves.toEqual({
      token: 'access-token',
    });
    expect(authService.refreshToken).toHaveBeenCalledWith(req, res);
  });

  it('logout repassa a resposta', () => {
    controller.logout(res);

    expect(authService.logout).toHaveBeenCalledWith(res);
  });

  // O refresh token so pode viver no cookie httpOnly.
  it('nenhum handler devolve refreshToken no corpo', async () => {
    authService.login.mockResolvedValue({ token: 'access-token' });
    authService.refreshToken.mockResolvedValue({ token: 'access-token' });

    const login = await controller.login(
      { email: 'a@b.com', password: 'Str0ng!Passw0rd' },
      res,
    );
    const refresh = await controller.refreshToken(mock<Request>(), res);

    expect(login).not.toHaveProperty('refreshToken');
    expect(refresh).not.toHaveProperty('refreshToken');
  });
});
