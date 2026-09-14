import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';

describe('App (e2e): health e contato', () => {
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

  describe('GET /health', () => {
    it('responde ok com o banco acessivel', async () => {
      await http().get('/health').expect(200, { status: 'ok' });
    });
  });

  describe('POST /contact', () => {
    const contato = {
      name: 'Maria',
      email: 'maria@cliente.com',
      message: 'Quero saber mais sobre o plano Pro.',
    };

    // Chamado direto, o endpoint seria um relay aberto de e-mail.
    it('recusa quem nao e o servidor Next', async () => {
      await http().post('/contact').send(contato).expect(401);
      expect(ctx.mailer.outbox).toHaveLength(0);
    });

    it('recusa token de servico errado', async () => {
      await http()
        .post('/contact')
        .set('X-Service-Token', 'x'.repeat(64))
        .send(contato)
        .expect(401);
    });

    it('com o token do Next, envia para a caixa da equipe', async () => {
      await http()
        .post('/contact')
        .set('X-Service-Token', process.env.SERVICE_TOKEN!)
        .send(contato)
        .expect(202, { sent: true });

      const mail = ctx.mailer.lastMailTo('equipe@example.com');
      expect(mail?.replyTo).toBe('maria@cliente.com');
      expect(mail?.html).toContain('Quero saber mais');
    });

    it('valida o corpo', async () => {
      await http()
        .post('/contact')
        .set('X-Service-Token', process.env.SERVICE_TOKEN!)
        .send({ name: 'M', email: 'nao-e-email', message: 'curta' })
        .expect(400);
    });
  });
});
