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

    it('GET /users exige token', async () => {
      await http().get('/users').expect(401);
    });

    it('POST /users exige token', async () => {
      await http().post('/users').expect(401);
    });

    it('GET /users/:id exige token', async () => {
      await http().get(`/users/${ID}`).expect(401);
    });

    it('PATCH /users/:id exige token', async () => {
      await http().patch(`/users/${ID}`).expect(401);
    });

    it('DELETE /users/:id exige token', async () => {
      await http().delete(`/users/${ID}`).expect(401);
    });

    it('rejeita esquema diferente de Bearer', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .get(`/users/${auth.id}`)
        .set('Authorization', `Basic ${auth.token}`)
        .expect(401);
    });
  });

  describe('GET /users', () => {
    it('permite ADMIN', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      const response = await http()
        .get('/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('bloqueia USER comum', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .get('/users')
        .set('Authorization', `Bearer ${user.token}`)
        .expect(403);
    });

    it('nunca inclui o hash de senha na listagem', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });
      await createUser(ctx.prisma);

      const response = await http()
        .get('/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(response.body.length).toBeGreaterThan(0);
      for (const user of response.body) {
        expect(user).not.toHaveProperty('password');
      }
    });
  });

  describe('GET /users/:id', () => {
    it('permite ler o proprio registro', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      const response = await http()
        .get(`/users/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(200);

      expect(response.body.id).toBe(user.id);
      expect(response.body).not.toHaveProperty('password');
    });

    it('bloqueia leitura do registro alheio', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);
      const outro = await createUser(ctx.prisma);

      await http()
        .get(`/users/${outro.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(403);
    });

    it('permite ADMIN ler qualquer registro', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });
      const outro = await createUser(ctx.prisma);

      await http()
        .get(`/users/${outro.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
    });

    it('rejeita id que nao e uuid', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      await http()
        .get('/users/nao-e-uuid')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(400);
    });
  });

  describe('PATCH /users/:id', () => {
    // Antes das correcoes, qualquer usuario autenticado trocava a senha de
    // qualquer outro por aqui — inclusive a de um ADMIN.
    it('bloqueia alterar a senha de outro usuario', async () => {
      const atacante = await createAndLogin(ctx.app, ctx.prisma);
      const vitima = await createUser(ctx.prisma);

      await http()
        .patch(`/users/${vitima.id}`)
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
        .patch(`/users/${user.id}`)
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
        .patch(`/users/${user.id}`)
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
        .patch(`/users/${user.id}`)
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
        .patch(`/users/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ password: 'fraca' })
        .expect(400);
    });
  });

  describe('POST /users', () => {
    it('bloqueia USER comum, para nao pular a confirmacao de e-mail', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .post('/users')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ email: uniqueEmail(), password: VALID_PASSWORD })
        .expect(403);
    });

    it('permite ADMIN', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      const response = await http()
        .post('/users')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ email: uniqueEmail(), password: VALID_PASSWORD })
        .expect(201);

      expect(response.body).not.toHaveProperty('password');
    });
  });

  describe('DELETE /users/:id', () => {
    it('bloqueia USER comum, mesmo no proprio registro', async () => {
      const user = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .delete(`/users/${user.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .expect(403);
    });

    it('permite ADMIN', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });
      const alvo = await createUser(ctx.prisma);

      await http()
        .delete(`/users/${alvo.id}`)
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
        .delete('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });
});
