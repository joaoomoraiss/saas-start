import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import {
  createAndLogin,
  createUser,
  uniqueEmail,
  VALID_PASSWORD,
} from './setup/fixtures';

describe('Users (e2e)', () => {
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

  describe('autenticacao obrigatoria', () => {
    const ID = '00000000-0000-0000-0000-000000000000';

    it('GET /user exige token', async () => {
      await http().get('/user').expect(401);
    });

    it('POST /user exige token', async () => {
      await http().post('/user').expect(401);
    });

    it('GET /user/:id exige token', async () => {
      await http().get(`/user/${ID}`).expect(401);
    });

    it('PATCH /user/:id exige token', async () => {
      await http().patch(`/user/${ID}`).expect(401);
    });

    it('DELETE /user/:id exige token', async () => {
      await http().delete(`/user/${ID}`).expect(401);
    });

    it('rejeita esquema diferente de Bearer', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .get(`/user/${auth.id}`)
        .set('Authorization', `Basic ${auth.token}`)
        .expect(401);
    });
  });

  describe('GET /user', () => {
    it('permite ADMIN', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      const response = await http()
        .get('/user')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('bloqueia USER comum', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .get('/user')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(403);
    });

    it('nunca inclui o hash de senha na listagem', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });
      await createUser(ctx.prisma);

      const response = await http()
        .get('/user')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      for (const user of response.body) {
        expect(user).not.toHaveProperty('password');
      }
    });
  });

  describe('GET /user/:id', () => {
    it('permite ler o proprio registro', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      const response = await http()
        .get(`/user/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(response.body.id).toBe(user.id);
      expect(response.body).not.toHaveProperty('password');
    });

    it('bloqueia leitura do registro alheio', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);
      const outro = await createUser(ctx.prisma);

      await http()
        .get(`/user/${outro.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(403);
    });

    it('permite ADMIN ler qualquer registro', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });
      const outro = await createUser(ctx.prisma);

      await http()
        .get(`/user/${outro.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
    });

    it('rejeita id que nao e uuid', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      await http()
        .get('/user/nao-e-uuid')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(400);
    });
  });

  describe('PATCH /user/:id', () => {
    // Antes das correcoes, qualquer usuario autenticado trocava a senha de
    // qualquer outro por aqui — inclusive a de um ADMIN.
    it('bloqueia alterar a senha de outro usuario', async () => {
      const atacante = await createAndLogin(ctx.app, ctx.prisma);
      const vitima = await createUser(ctx.prisma);

      await http()
        .patch(`/user/${vitima.id}`)
        .set('Authorization', `Bearer ${atacante.token}`)
        .send({ password: 'Tak30ver!Pass1' })
        .expect(403);

      // A senha original continua valendo.
      await http()
        .post('/auth/login')
        .send({ email: vitima.email, password: VALID_PASSWORD })
        .expect(200);
    });

    it('permite alterar a propria senha', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);
      const novaSenha = 'My0wn!Passw0rd';

      await http()
        .patch(`/user/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ password: novaSenha })
        .expect(200);

      await http()
        .post('/auth/login')
        .send({ email: user.email, password: novaSenha })
        .expect(200);
    });

    it('rejeita autopromocao a ADMIN', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .patch(`/user/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ role: 'ADMIN' })
        .expect(400);

      const persistido = await ctx.prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(persistido?.role).toBe('USER');
    });

    it('rejeita autoverificacao de e-mail', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma, {
        isVerified: false,
      });

      await http()
        .patch(`/user/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ isVerified: true })
        .expect(400);

      const persistido = await ctx.prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(persistido?.isVerified).toBe(false);
    });

    it('aplica a regra de forca da senha', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .patch(`/user/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ password: 'fraca' })
        .expect(400);
    });
  });

  describe('POST /user', () => {
    it('bloqueia USER comum, para nao pular a confirmacao de e-mail', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .post('/user')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ email: uniqueEmail(), password: VALID_PASSWORD })
        .expect(403);
    });

    it('permite ADMIN', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      const response = await http()
        .post('/user')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ email: uniqueEmail(), password: VALID_PASSWORD })
        .expect(201);

      expect(response.body).not.toHaveProperty('password');
    });
  });

  describe('DELETE /user/:id', () => {
    it('bloqueia USER comum, mesmo no proprio registro', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .delete(`/user/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(403);
    });

    it('permite ADMIN', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });
      const alvo = await createUser(ctx.prisma);

      await http()
        .delete(`/user/${alvo.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(
        await ctx.prisma.user.findUnique({ where: { id: alvo.id } }),
      ).toBeNull();
    });

    it('responde 404 para id inexistente', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      await http()
        .delete('/user/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('perfil do proprio usuario', () => {
    it('GET /user/profile exige token', async () => {
      await http().get('/user/profile').expect(401);
    });

    it('devolve o perfil sem senha nem ids da Stripe', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      const response = await http()
        .get('/user/profile')
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(200);

      expect(response.body).toEqual({
        name: null,
        email: auth.email,
        plan: 'FREE',
        credits: 0,
        subscriptionStatus: null,
        isVerified: true,
      });
      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('stripeCustomerId');
      expect(response.body).not.toHaveProperty('id');
    });

    // Sem isso o frontend nao teria como exibir o aviso de confirmacao.
    it('responde mesmo com e-mail pendente de confirmacao', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma, {
        isVerified: false,
      });

      const response = await http()
        .get('/user/profile')
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(200);

      expect(response.body.isVerified).toBe(false);
    });

    it('PATCH /user/profile altera o nome', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      const response = await http()
        .patch('/user/profile')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ name: 'Joao Morais' })
        .expect(200);

      expect(response.body.name).toBe('Joao Morais');
    });

    it('PATCH /user/profile recusa campos fora do DTO', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      // plan e credits sao estado de billing: so o webhook escreve neles.
      await http()
        .patch('/user/profile')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ name: 'Joao', plan: 'PRO', credits: 9999 })
        .expect(400);

      const depois = await ctx.prisma.user.findUnique({
        where: { id: auth.id },
      });
      expect(depois?.plan).toBe('FREE');
      expect(depois?.credits).toBe(0);
    });

    it('PATCH /user/profile exige e-mail confirmado', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma, {
        isVerified: false,
      });

      await http()
        .patch('/user/profile')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ name: 'Joao' })
        .expect(403);
    });
  });

  describe('PATCH /user/password', () => {
    it('exige token', async () => {
      await http().patch('/user/password').expect(401);
    });

    it('recusa quando a senha atual esta errada', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .patch('/user/password')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ currentPassword: 'errada', newPassword: 'N0va!Senha' })
        .expect(401);
    });

    it('troca a senha e permite login com a nova', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .patch('/user/password')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({
          currentPassword: VALID_PASSWORD,
          newPassword: 'N0va!Senha123',
        })
        .expect(200);

      await http()
        .post('/auth/login')
        .send({ email: auth.email, password: 'N0va!Senha123' })
        .expect(200);

      await http()
        .post('/auth/login')
        .send({ email: auth.email, password: VALID_PASSWORD })
        .expect(401);
    });

    it('aplica a regra de forca na nova senha', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .patch('/user/password')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ currentPassword: VALID_PASSWORD, newPassword: '123' })
        .expect(400);
    });

    it('exige e-mail confirmado', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma, {
        isVerified: false,
      });

      await http()
        .patch('/user/password')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({
          currentPassword: VALID_PASSWORD,
          newPassword: 'N0va!Senha123',
        })
        .expect(403);
    });
  });
});
