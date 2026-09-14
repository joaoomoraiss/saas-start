import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import { createAndLogin, createUser } from './setup/fixtures';

/**
 * A suite roda SEM STRIPE_SECRET_KEY (ver global-setup): o objetivo aqui e a
 * superficie HTTP — guards, isolamento entre usuarios e a rejeicao do webhook
 * nao assinado. A regra de negocio dos eventos e coberta na suite unitaria,
 * com o SDK mockado.
 */
describe('Payments (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer() as App);

  const ID = '00000000-0000-0000-0000-000000000000';

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
    it('POST /payments/checkout exige token', async () => {
      await http()
        .post('/payments/checkout')
        .send({ plan: 'STANDARD' })
        .expect(401);
    });

    it('POST /payments/cancel exige token', async () => {
      await http().post('/payments/cancel').expect(401);
    });

    it('GET /payments/user exige token', async () => {
      await http().get('/payments/user').expect(401);
    });

    it('GET /payments exige token', async () => {
      await http().get('/payments').expect(401);
    });

    it('DELETE /payments/:id exige token', async () => {
      await http().delete(`/payments/${ID}`).expect(401);
    });

    it('POST /payments/resume exige token', async () => {
      await http().post('/payments/resume').expect(401);
    });

    it('POST /payments/refund exige token', async () => {
      await http().post('/payments/refund').expect(401);
    });
  });

  describe('acoes sobre a assinatura sem assinatura', () => {
    it('cancelar sem assinatura responde 400', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .post('/payments/cancel')
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(400);
    });

    it('retomar sem cancelamento agendado responde 400', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .post('/payments/resume')
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(400);
    });

    it('reembolso sem cobranca na janela de 7 dias responde 400', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);
      await ctx.prisma.payment.create({
        data: {
          userId: auth.id,
          plan: 'STANDARD',
          amount: 4900,
          currency: 'brl',
          stripeInvoiceId: 'in_antiga',
          paidAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        },
      });

      await http()
        .post('/payments/refund')
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(400);
    });
  });

  describe('rotas de admin', () => {
    it('usuario comum nao lista todas as cobrancas', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .get('/payments')
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(403);
    });

    it('usuario comum nao le o historico de outro usuario', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);
      const outro = await createUser(ctx.prisma);

      await http()
        .get(`/payments/user/${outro.id}`)
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(403);
    });

    it('usuario comum nao remove registro de cobranca', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .delete(`/payments/${ID}`)
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(403);
    });

    it('admin lista todas as cobrancas', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      await http()
        .get('/payments')
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
    });

    it('admin recebe 404 ao remover cobranca inexistente', async () => {
      const admin = await createAndLogin(ctx.app, ctx.prisma, {
        role: 'ADMIN',
      });

      await http()
        .delete(`/payments/${ID}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(404);
    });
  });

  describe('GET /payments/user', () => {
    /** Cria uma cobranca direto no banco: a tabela so e escrita pelo webhook. */
    async function givenPayment(userId: string, invoiceId: string) {
      return ctx.prisma.payment.create({
        data: {
          userId,
          plan: 'STANDARD',
          amount: 4900,
          currency: 'brl',
          stripeInvoiceId: invoiceId,
          paidAt: new Date(),
        },
      });
    }

    it('devolve apenas as cobrancas do usuario do token', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);
      const outro = await createUser(ctx.prisma);

      await givenPayment(auth.id, 'in_minha');
      await givenPayment(outro.id, 'in_do_outro');

      const response = await http()
        .get('/payments/user')
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].stripeInvoiceId).toBe('in_minha');
    });

    it('ordena da cobranca mais recente para a mais antiga', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await ctx.prisma.payment.create({
        data: {
          userId: auth.id,
          plan: 'STANDARD',
          amount: 4900,
          currency: 'brl',
          stripeInvoiceId: 'in_antiga',
          paidAt: new Date('2026-01-01T00:00:00Z'),
        },
      });
      await ctx.prisma.payment.create({
        data: {
          userId: auth.id,
          plan: 'STANDARD',
          amount: 4900,
          currency: 'brl',
          stripeInvoiceId: 'in_recente',
          paidAt: new Date('2026-06-01T00:00:00Z'),
        },
      });

      const response = await http()
        .get('/payments/user')
        .set('Authorization', `Bearer ${auth.token}`)
        .expect(200);

      expect(
        response.body.map(
          (p: { stripeInvoiceId: string }) => p.stripeInvoiceId,
        ),
      ).toEqual(['in_recente', 'in_antiga']);
    });
  });

  describe('e-mail nao confirmado', () => {
    it('bloqueia o checkout mesmo com REQUIRE_EMAIL_VERIFICATION=false', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma, {
        isVerified: false,
      });

      await http()
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ plan: 'STANDARD' })
        .expect(403);
    });
  });

  describe('POST /payments/checkout', () => {
    it('recusa plano gratuito', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ plan: 'FREE' })
        .expect(400);
    });

    it('recusa plano inexistente', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ plan: 'ENTERPRISE' })
        .expect(400);
    });

    it('ignora priceId enviado pelo cliente (forbidNonWhitelisted)', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ plan: 'STANDARD', priceId: 'price_de_um_real' })
        .expect(400);
    });

    it('responde 503 quando a Stripe nao esta configurada', async () => {
      const auth = await createAndLogin(ctx.app, ctx.prisma);

      await http()
        .post('/payments/checkout')
        .set('Authorization', `Bearer ${auth.token}`)
        .send({ plan: 'STANDARD' })
        .expect(503);
    });
  });

  describe('POST /payments/webhook', () => {
    it('e publico: nao exige token', async () => {
      const response = await http()
        .post('/payments/webhook')
        .send({ type: 'checkout.session.completed' });

      expect(response.status).not.toBe(401);
    });

    it('recusa requisicao sem o header de assinatura', async () => {
      await http()
        .post('/payments/webhook')
        .send({ type: 'checkout.session.completed' })
        .expect(400);
    });

    it('nao processa evento com assinatura invalida', async () => {
      const user = await createUser(ctx.prisma);

      await http()
        .post('/payments/webhook')
        .set('stripe-signature', 't=1,v1=forjado')
        .send({
          type: 'checkout.session.completed',
          data: {
            object: {
              customer: 'cus_forjado',
              subscription: 'sub_forjado',
              metadata: { userId: user.id, plan: 'PRO' },
            },
          },
        })
        .expect((res) => {
          // 400 (assinatura invalida) ou 503 (Stripe desligada): o que nao
          // pode acontecer e o evento ser aceito.
          expect([400, 503]).toContain(res.status);
        });

      // O plano forjado nunca foi liberado.
      const depois = await ctx.prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(depois?.plan).toBe('FREE');
      expect(depois?.credits).toBe(0);
    });
  });
});
