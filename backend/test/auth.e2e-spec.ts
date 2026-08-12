import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import {
  createAndLogin,
  createUser,
  extractCookie,
  uniqueEmail,
  VALID_PASSWORD,
} from './setup/fixtures';

describe('Auth (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer() as App);

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  describe('POST /auth/register', () => {
    it('cria o usuario e dispara o e-mail de confirmacao', async () => {
      const email = uniqueEmail();

      const response = await http()
        .post('/auth/register')
        .send({ email, password: VALID_PASSWORD })
        .expect(201);

      expect(response.body).toEqual({ id: expect.any(String), email });
      expect(ctx.mailer.lastMailTo(email)).toBeDefined();
    });

    it('nunca devolve o hash da senha', async () => {
      const email = uniqueEmail();

      const response = await http()
        .post('/auth/register')
        .send({ email, password: VALID_PASSWORD })
        .expect(201);

      expect(response.body).not.toHaveProperty('password');
    });

    it('nasce com isVerified false', async () => {
      const email = uniqueEmail();

      await http()
        .post('/auth/register')
        .send({ email, password: VALID_PASSWORD });

      const user = await ctx.prisma.user.findUnique({ where: { email } });
      expect(user?.isVerified).toBe(false);
    });

    it('rejeita senha fraca', async () => {
      await http()
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: 'weak' })
        .expect(400);
    });

    it('rejeita e-mail invalido', async () => {
      await http()
        .post('/auth/register')
        .send({ email: 'nao-e-um-email', password: VALID_PASSWORD })
        .expect(400);
    });

    it('remove campos nao declarados no DTO', async () => {
      await http()
        .post('/auth/register')
        .send({ email: uniqueEmail(), password: VALID_PASSWORD, role: 'ADMIN' })
        .expect(400);
    });

    it('rejeita e-mail ja cadastrado', async () => {
      const email = uniqueEmail();

      await http()
        .post('/auth/register')
        .send({ email, password: VALID_PASSWORD })
        .expect(201);
      await http()
        .post('/auth/register')
        .send({ email, password: VALID_PASSWORD })
        .expect(422);
    });
  });

  describe('POST /auth/login', () => {
    it('devolve o access token e grava o refresh em cookie httpOnly', async () => {
      const user = await createUser(ctx.prisma);

      const response = await http()
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      expect(response.body.token).toEqual(expect.any(String));

      const cookie = extractCookie(response, 'refreshToken');
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/');
    });

    it('nao expoe o refresh token no corpo da resposta', async () => {
      const user = await createUser(ctx.prisma);

      const response = await http()
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(200);

      expect(response.body).not.toHaveProperty('refreshToken');
    });

    it('responde 401 com senha errada, nao 500', async () => {
      const user = await createUser(ctx.prisma);

      await http()
        .post('/auth/login')
        .send({ email: user.email, password: 'Wr0ng!Passw0rd' })
        .expect(401);
    });

    it('responde 401 para usuario inexistente', async () => {
      await http()
        .post('/auth/login')
        .send({ email: uniqueEmail(), password: VALID_PASSWORD })
        .expect(401);
    });
  });

  describe('separacao de tokens por proposito', () => {
    // A regressao mais grave que a suite protege: o link de confirmacao
    // trafega em texto plano dentro de uma URL de e-mail. Se ele autenticar
    // na API, qualquer vazamento de e-mail vira sequestro de conta.
    it('token de confirmacao de e-mail nao autentica como bearer', async () => {
      const email = uniqueEmail();
      await http()
        .post('/auth/register')
        .send({ email, password: VALID_PASSWORD });

      const confirmToken = ctx.mailer.tokenFor(email);

      await http()
        .get('/users')
        .set('Authorization', `Bearer ${confirmToken}`)
        .expect(401);
    });

    it('token de reset de senha nao autentica como bearer', async () => {
      const user = await createUser(ctx.prisma);
      await http().post('/auth/forgot-password').send({ email: user.email });

      const resetToken = ctx.mailer.tokenFor(user.email);

      await http()
        .get(`/users/${user.id}`)
        .set('Authorization', `Bearer ${resetToken}`)
        .expect(401);
    });

    it('access token nao serve para confirmar e-mail', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma, {
        isVerified: false,
      });

      await http()
        .post('/auth/confirm')
        .send({ token: auth.token })
        .expect(401);
    });

    it('refresh token nao autentica como bearer', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);
      const refreshToken = auth.refreshCookie.split('=')[1].split(';')[0];

      await http()
        .get(`/users/${auth.id}`)
        .set('Authorization', `Bearer ${refreshToken}`)
        .expect(401);
    });
  });

  describe('POST /auth/confirm', () => {
    it('marca o usuario como verificado', async () => {
      const email = uniqueEmail();
      await http()
        .post('/auth/register')
        .send({ email, password: VALID_PASSWORD });

      await http()
        .post('/auth/confirm')
        .send({ token: ctx.mailer.tokenFor(email) })
        .expect(204);

      const user = await ctx.prisma.user.findUnique({ where: { email } });
      expect(user?.isVerified).toBe(true);
    });

    it('rejeita token com assinatura invalida', async () => {
      await http().post('/auth/confirm').send({ token: 'a.b.c' }).expect(401);
    });

    it('rejeita corpo sem token', async () => {
      await http().post('/auth/confirm').send({}).expect(400);
    });
  });

  describe('POST /auth/forgot-password e /auth/reset-password', () => {
    it('responde igual para e-mail inexistente, sem revelar cadastro', async () => {
      const known = await createUser(ctx.prisma);

      const knownResponse = await http()
        .post('/auth/forgot-password')
        .send({ email: known.email });

      const unknownResponse = await http()
        .post('/auth/forgot-password')
        .send({ email: uniqueEmail() });

      expect(unknownResponse.status).toBe(knownResponse.status);
      expect(unknownResponse.body).toEqual(knownResponse.body);
    });

    it('troca a senha e permite login com a nova', async () => {
      const user = await createUser(ctx.prisma);
      const newPassword = 'An0ther!Passw0rd';

      await http().post('/auth/forgot-password').send({ email: user.email });

      await http()
        .post('/auth/reset-password')
        .send({ token: ctx.mailer.tokenFor(user.email), newPassword })
        .expect(204);

      await http()
        .post('/auth/login')
        .send({ email: user.email, password: newPassword })
        .expect(200);

      await http()
        .post('/auth/login')
        .send({ email: user.email, password: VALID_PASSWORD })
        .expect(401);
    });

    it('aplica a regra de forca na nova senha', async () => {
      const user = await createUser(ctx.prisma);
      await http().post('/auth/forgot-password').send({ email: user.email });

      await http()
        .post('/auth/reset-password')
        .send({ token: ctx.mailer.tokenFor(user.email), newPassword: 'weak' })
        .expect(400);
    });
  });

  describe('POST /auth/refresh-token', () => {
    it('emite um novo access token a partir do cookie', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      const response = await http()
        .post('/auth/refresh-token')
        .set('Cookie', auth.refreshCookie)
        .expect(200);

      expect(response.body.token).toEqual(expect.any(String));
      expect(extractCookie(response, 'refreshToken')).toContain('HttpOnly');
    });

    it('responde 401 sem cookie, em vez de estourar', async () => {
      await http().post('/auth/refresh-token').expect(401);
    });

    it('responde 401 com cookie invalido', async () => {
      await http()
        .post('/auth/refresh-token')
        .set('Cookie', 'refreshToken=nao.e.um.jwt')
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('limpa o cookie de refresh', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      const response = await http()
        .post('/auth/logout')
        .set('Cookie', auth.refreshCookie)
        .expect(204);

      expect(extractCookie(response, 'refreshToken')).toMatch(/refreshToken=;/);
    });
  });
});
