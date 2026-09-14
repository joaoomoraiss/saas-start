import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentRecordService } from './payment-record.service';
import { PaymentsService, REFUND_WINDOW_MS } from './payments.service';

const PRICE_STANDARD = 'price_standard_123';
const PRICE_PRO = 'price_pro_456';

const ENV: Record<string, string> = {
  FRONTEND_URL: 'http://localhost:3001',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PRICE_ID_STANDARD: PRICE_STANDARD,
  STRIPE_PRICE_ID_PRO: PRICE_PRO,
};

const USER = {
  id: 'user-1',
  email: 'a@b.com',
  plan: 'FREE',
  credits: 0,
  subscriptionStatus: null,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  stripeCheckoutSessionId: null,
};

const SUBSCRIBED = {
  ...USER,
  plan: 'STANDARD',
  subscriptionStatus: 'active',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
};

/** Fatura minima com os campos que os handlers realmente leem. */
function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'in_1',
    customer: 'cus_1',
    amount_paid: 4900,
    currency: 'brl',
    created: 1_700_000_000,
    status_transitions: { paid_at: 1_700_000_500 },
    hosted_invoice_url: 'https://stripe.test/receipt',
    invoice_pdf: 'https://stripe.test/receipt.pdf',
    billing_reason: 'subscription_create',
    parent: { subscription_details: { subscription: 'sub_1' } },
    lines: {
      data: [{ pricing: { price_details: { price: PRICE_STANDARD } } }],
    },
    ...overrides,
  } as unknown as Stripe.Invoice;
}

const eventOf = (type: string, object: unknown) =>
  ({ type, data: { object } }) as unknown as Stripe.Event;

describe('PaymentsService', () => {
  let service: PaymentsService;
  let stripe: DeepMockProxy<Stripe>;
  let prisma: DeepMockProxy<PrismaService>;
  let records: DeepMockProxy<PaymentRecordService>;

  beforeEach(() => {
    stripe = mockDeep<Stripe>();
    prisma = mockDeep<PrismaService>();
    records = mockDeep<PaymentRecordService>();

    const config = {
      get: (key: string) => ENV[key],
    } as unknown as ConfigService;

    service = new PaymentsService(stripe, config, prisma, records);
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('createCheckout', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      stripe.checkout.sessions.create.mockResolvedValue({
        id: 'cs_novo',
        url: 'https://checkout.stripe.test/s_1',
      } as any);
    });

    it('recusa plano que nao passa por checkout', async () => {
      await expect(service.createCheckout(USER.id, 'FREE')).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it('resolve o Price ID pela env, nunca pelo request', async () => {
      await service.createCheckout(USER.id, 'STANDARD');

      const args = stripe.checkout.sessions.create.mock.calls[0][0]!;
      expect(args.line_items).toEqual([{ price: PRICE_STANDARD, quantity: 1 }]);
    });

    it('grava userId e plan na metadata da sessao E da assinatura', async () => {
      await service.createCheckout(USER.id, 'PRO');

      const args = stripe.checkout.sessions.create.mock.calls[0][0]!;
      expect(args.metadata).toEqual({ userId: USER.id, plan: 'PRO' });
      // A fatura pode chegar antes do checkout.session.completed; a metadata
      // da assinatura e o caminho ate o usuario nesse caso.
      expect(args.subscription_data?.metadata).toEqual({
        userId: USER.id,
        plan: 'PRO',
      });
    });

    it('guarda a sessao criada para poder expira-la depois', async () => {
      await service.createCheckout(USER.id, 'STANDARD');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { stripeCheckoutSessionId: 'cs_novo' },
      });
    });

    it('usa customer_email quando o usuario ainda nao tem cliente na Stripe', async () => {
      await service.createCheckout(USER.id, 'STANDARD');

      const args = stripe.checkout.sessions.create.mock.calls[0][0]!;
      expect(args.customer_email).toBe(USER.email);
      expect(args.customer).toBeUndefined();
    });

    it('reutiliza o cliente existente em vez de criar outro', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...USER,
        stripeCustomerId: 'cus_existente',
        subscriptionStatus: 'canceled',
      } as any);

      await service.createCheckout(USER.id, 'STANDARD');

      const args = stripe.checkout.sessions.create.mock.calls[0][0]!;
      expect(args.customer).toBe('cus_existente');
      expect(args.customer_email).toBeUndefined();
    });

    it('falha explicitamente quando a Stripe nao devolve URL', async () => {
      stripe.checkout.sessions.create.mockResolvedValue({ url: null } as any);

      await expect(service.createCheckout(USER.id, 'STANDARD')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    describe('protecao contra assinatura em dobro', () => {
      it.each(['active', 'past_due', 'canceling'])(
        'recusa com 409 quem ja tem assinatura %s',
        async (status) => {
          prisma.user.findUnique.mockResolvedValue({
            ...SUBSCRIBED,
            subscriptionStatus: status,
          } as any);

          await expect(service.createCheckout(USER.id, 'PRO')).rejects.toThrow(
            ConflictException,
          );
          expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
        },
      );

      it('expira a sessao de checkout anterior ainda aberta', async () => {
        prisma.user.findUnique.mockResolvedValue({
          ...USER,
          stripeCheckoutSessionId: 'cs_velho',
        } as any);
        stripe.checkout.sessions.retrieve.mockResolvedValue({
          status: 'open',
        } as any);

        await service.createCheckout(USER.id, 'STANDARD');

        expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith(
          'cs_velho',
        );
        expect(stripe.checkout.sessions.create).toHaveBeenCalled();
      });

      it('recusa com 409 quando a sessao anterior ja foi paga e o webhook nao chegou', async () => {
        prisma.user.findUnique.mockResolvedValue({
          ...USER,
          stripeCheckoutSessionId: 'cs_velho',
        } as any);
        stripe.checkout.sessions.retrieve.mockResolvedValue({
          status: 'complete',
        } as any);

        await expect(
          service.createCheckout(USER.id, 'STANDARD'),
        ).rejects.toThrow(ConflictException);
        expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      });

      it('recusa com 409 quando a sessao e paga entre a leitura e o expire', async () => {
        prisma.user.findUnique.mockResolvedValue({
          ...USER,
          stripeCheckoutSessionId: 'cs_velho',
        } as any);
        stripe.checkout.sessions.retrieve.mockResolvedValue({
          status: 'open',
        } as any);
        stripe.checkout.sessions.expire.mockRejectedValue(
          new Error('complete'),
        );

        await expect(
          service.createCheckout(USER.id, 'STANDARD'),
        ).rejects.toThrow(ConflictException);
      });

      it('segue quando a sessao anterior nao existe mais na Stripe', async () => {
        prisma.user.findUnique.mockResolvedValue({
          ...USER,
          stripeCheckoutSessionId: 'cs_de_outro_ambiente',
        } as any);
        stripe.checkout.sessions.retrieve.mockRejectedValue(
          new Error('No such checkout.session'),
        );

        await expect(
          service.createCheckout(USER.id, 'STANDARD'),
        ).resolves.toEqual({ url: 'https://checkout.stripe.test/s_1' });
      });
    });
  });

  describe('checkout.session.completed', () => {
    const session = (metadata: Record<string, string> | null) => ({
      id: 'cs_1',
      customer: 'cus_1',
      subscription: 'sub_1',
      metadata,
    });

    // Um 4xx aqui faria a Stripe reentregar para sempre algo que nunca vai
    // dar certo.
    it('ignora sessao sem metadata, sem lancar', async () => {
      await expect(
        service.handleEvent(
          eventOf('checkout.session.completed', session(null)),
        ),
      ).resolves.toBeUndefined();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('ativa a assinatura, credita a cota e limpa a sessao pendente', async () => {
      await service.handleEvent(
        eventOf(
          'checkout.session.completed',
          session({ userId: USER.id, plan: 'STANDARD' }),
        ),
      );

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: USER.id,
          OR: [
            { stripeSubscriptionId: null },
            { stripeSubscriptionId: { not: 'sub_1' } },
          ],
        },
        data: {
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
          stripeCheckoutSessionId: null,
          subscriptionStatus: 'active',
          plan: 'STANDARD',
          credits: { increment: 100 },
        },
      });
    });

    it('credita via increment atomico, nunca lendo-somando-escrevendo', async () => {
      await service.handleEvent(
        eventOf(
          'checkout.session.completed',
          session({ userId: USER.id, plan: 'PRO' }),
        ),
      );

      const data = prisma.user.updateMany.mock.calls[0][0].data as {
        credits: unknown;
      };
      expect(data.credits).toEqual({ increment: 500 });
    });

    it('reentrega do mesmo evento nao credita de novo (filtro pela assinatura)', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.handleEvent(
          eventOf(
            'checkout.session.completed',
            session({ userId: USER.id, plan: 'PRO' }),
          ),
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('invoice.payment_succeeded', () => {
    const event = (overrides: Record<string, unknown> = {}) =>
      eventOf('invoice.payment_succeeded', invoice(overrides));

    it('ignora evento orfao sem estourar (evita loop de reentrega)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      stripe.subscriptions.retrieve.mockResolvedValue({ metadata: {} } as any);

      await expect(service.handleEvent(event())).resolves.toBeUndefined();
      expect(records.upsertByInvoice).not.toHaveBeenCalled();
    });

    it('acha o usuario pela metadata da assinatura quando a fatura chega antes do checkout', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null) // por stripeCustomerId: ainda nao gravado
        .mockResolvedValueOnce(USER as any); // pelo userId da metadata
      stripe.subscriptions.retrieve.mockResolvedValue({
        metadata: { userId: USER.id },
      } as any);

      await service.handleEvent(event());

      expect(stripe.subscriptions.retrieve).toHaveBeenCalledWith(
        'sub_1',
        {},
        expect.objectContaining({ timeout: expect.any(Number) }),
      );
      expect(records.upsertByInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER.id }),
      );
    });

    // Engolir o erro perderia a fatura; o 503 faz a Stripe reentregar.
    it('falha com 503 se nao conseguir consultar a assinatura', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      stripe.subscriptions.retrieve.mockRejectedValue(new Error('timeout'));

      await expect(service.handleEvent(event())).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('grava a fatura mas NAO credita na assinatura inicial', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await service.handleEvent(
        event({ billing_reason: 'subscription_create' }),
      );

      expect(records.upsertByInvoice).toHaveBeenCalledTimes(1);
      // O credito da assinatura inicial vem do checkout.session.completed;
      // creditar aqui tambem daria em dobro.
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('grava a fatura E credita na renovacao', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await service.handleEvent(
        event({ billing_reason: 'subscription_cycle' }),
      );

      expect(records.upsertByInvoice).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: {
          plan: 'STANDARD',
          subscriptionStatus: 'active',
          credits: { increment: 100 },
        },
      });
    });

    it('normaliza os dados da fatura antes de persistir', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await service.handleEvent(event());

      expect(records.upsertByInvoice).toHaveBeenCalledWith({
        userId: USER.id,
        plan: 'STANDARD',
        amount: 4900,
        currency: 'brl',
        stripeInvoiceId: 'in_1',
        stripeCustomerId: 'cus_1',
        stripeSubscriptionId: 'sub_1',
        hostedInvoiceUrl: 'https://stripe.test/receipt',
        invoicePdfUrl: 'https://stripe.test/receipt.pdf',
        paidAt: new Date(1_700_000_500 * 1000),
      });
    });

    it('descobre o plano pelo Price ID da fatura (renovacao nao tem metadata)', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await service.handleEvent(
        event({
          billing_reason: 'subscription_cycle',
          lines: {
            data: [{ pricing: { price_details: { price: PRICE_PRO } } }],
          },
        }),
      );

      const data = prisma.user.update.mock.calls[0][0].data as { plan: string };
      expect(data.plan).toBe('PRO');
    });

    it('cai no plano atual do usuario quando o Price ID e desconhecido', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...USER,
        plan: 'PRO',
      } as any);

      await service.handleEvent(
        event({
          lines: {
            data: [{ pricing: { price_details: { price: 'price_?' } } }],
          },
        }),
      );

      const [args] = records.upsertByInvoice.mock.calls[0];
      expect(args.plan).toBe('PRO');
    });
  });

  describe('invoice.payment_failed', () => {
    it('marca past_due sem rebaixar, so na assinatura da fatura', async () => {
      await service.handleEvent(eventOf('invoice.payment_failed', invoice()));

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' },
        data: { subscriptionStatus: 'past_due' },
      });
    });

    it('ignora fatura sem assinatura (nao marca o cliente inteiro)', async () => {
      await service.handleEvent(
        eventOf('invoice.payment_failed', invoice({ parent: null })),
      );

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.updated', () => {
    const updated = (overrides: Record<string, unknown>) =>
      eventOf('customer.subscription.updated', {
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: false,
        cancel_at: null,
        ...overrides,
      });

    it.each([
      [{ cancel_at_period_end: true }, 'canceling'],
      [{ cancel_at: 1_800_000_000 }, 'canceling'],
      [{}, 'active'],
      [{ status: 'past_due' }, 'past_due'],
      [{ status: 'unpaid' }, 'past_due'],
    ])('%o vira %s', async (overrides, expected) => {
      await service.handleEvent(updated(overrides));

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_1' },
        data: { subscriptionStatus: expected },
      });
    });

    it('ignora status transitorios (incomplete, trialing)', async () => {
      await service.handleEvent(updated({ status: 'incomplete' }));

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.deleted', () => {
    it('rebaixa para FREE casando cliente E assinatura', async () => {
      await service.handleEvent(
        eventOf('customer.subscription.deleted', {
          id: 'sub_1',
          customer: 'cus_1',
        }),
      );

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' },
        data: {
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
          plan: 'FREE',
        },
      });
    });
  });

  it('ignora tipo de evento desconhecido sem lancar', async () => {
    await expect(
      service.handleEvent(eventOf('customer.created', {})),
    ).resolves.toBeUndefined();
  });

  describe('cancelSubscription (fim do periodo)', () => {
    it('recusa quando nao ha assinatura', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await expect(service.cancelSubscription(USER.id)).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.subscriptions.update).not.toHaveBeenCalled();
    });

    it('recusa quando o cancelamento ja esta agendado', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...SUBSCRIBED,
        subscriptionStatus: 'canceling',
      } as any);

      await expect(service.cancelSubscription(USER.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    // Tirar o acesso no clique fica com o dinheiro do periodo ja pago.
    it('agenda o fim na Stripe e mantem o plano pago ate la', async () => {
      prisma.user.findUnique.mockResolvedValue(SUBSCRIBED as any);

      await service.cancelSubscription(USER.id);

      expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        cancel_at_period_end: true,
      });
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { subscriptionStatus: 'canceling' },
      });
    });
  });

  describe('resumeSubscription', () => {
    it('recusa quando nao ha cancelamento agendado', async () => {
      prisma.user.findUnique.mockResolvedValue(SUBSCRIBED as any);

      await expect(service.resumeSubscription(USER.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('desfaz o agendamento e volta para active', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...SUBSCRIBED,
        subscriptionStatus: 'canceling',
      } as any);

      await service.resumeSubscription(USER.id);

      expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_1', {
        cancel_at_period_end: false,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: { subscriptionStatus: 'active' },
      });
    });
  });

  describe('cancelImmediately', () => {
    it('sem assinatura nao faz nada', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await service.cancelImmediately(USER.id);

      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('cancela agora e rebaixa para FREE', async () => {
      prisma.user.findUnique.mockResolvedValue(SUBSCRIBED as any);

      await service.cancelImmediately(USER.id);

      expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: {
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
          plan: 'FREE',
        },
      });
    });

    it('tolera assinatura que ja nao existe na Stripe', async () => {
      prisma.user.findUnique.mockResolvedValue(SUBSCRIBED as any);
      stripe.subscriptions.cancel.mockRejectedValue(
        new Stripe.errors.StripeInvalidRequestError({
          type: 'invalid_request_error',
          code: 'resource_missing',
          message: 'No such subscription',
        } as any),
      );

      await service.cancelImmediately(USER.id);

      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('propaga outras falhas sem mexer no estado local', async () => {
      prisma.user.findUnique.mockResolvedValue(SUBSCRIBED as any);
      stripe.subscriptions.cancel.mockRejectedValue(new Error('Stripe fora'));

      await expect(service.cancelImmediately(USER.id)).rejects.toThrow(
        'Stripe fora',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('refundLatestPayment (CDC Art. 49)', () => {
    const PAYMENT = {
      id: 'pay-1',
      userId: USER.id,
      plan: 'STANDARD',
      status: 'PAID',
      stripeInvoiceId: 'in_1',
      paidAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    };

    beforeEach(() => {
      prisma.payment.findFirst.mockResolvedValue(PAYMENT as any);
      prisma.user.findUnique.mockResolvedValue(SUBSCRIBED as any);
      stripe.invoicePayments.list.mockResolvedValue({
        data: [{ payment: { payment_intent: 'pi_1' } }],
      } as any);
    });

    it('recusa quando nao ha cobranca paga', async () => {
      prisma.payment.findFirst.mockResolvedValue(null);

      await expect(service.refundLatestPayment(USER.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('recusa cobranca fora da janela de 7 dias', async () => {
      prisma.payment.findFirst.mockResolvedValue({
        ...PAYMENT,
        paidAt: new Date(Date.now() - REFUND_WINDOW_MS - 60_000),
      } as any);

      await expect(service.refundLatestPayment(USER.id)).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    it('reembolsa pelo PaymentIntent, com idempotency key', async () => {
      await service.refundLatestPayment(USER.id);

      expect(stripe.invoicePayments.list).toHaveBeenCalledWith({
        invoice: 'in_1',
        status: 'paid',
        limit: 1,
      });
      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_1' },
        { idempotencyKey: 'refund-pay-1' },
      );
    });

    it('marca REFUNDED, encerra o plano na hora e devolve os creditos', async () => {
      await service.refundLatestPayment(USER.id);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
        data: { status: 'REFUNDED' },
      });
      expect(stripe.subscriptions.cancel).toHaveBeenCalledWith('sub_1');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('responde 422 quando a cobranca original nao e localizada', async () => {
      stripe.invoicePayments.list.mockResolvedValue({ data: [] } as any);

      await expect(service.refundLatestPayment(USER.id)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(stripe.refunds.create).not.toHaveBeenCalled();
    });

    // Direcao segura de falhar: cliente continua pago e intocado.
    it('nao mexe no estado local se o reembolso falhar', async () => {
      stripe.refunds.create.mockRejectedValue(new Error('recusado'));

      await expect(service.refundLatestPayment(USER.id)).rejects.toThrow(
        'recusado',
      );
      expect(prisma.payment.update).not.toHaveBeenCalled();
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });
  });

  describe('sem Stripe configurada', () => {
    beforeEach(() => {
      service = new PaymentsService(
        null,
        { get: (key: string) => ENV[key] } as unknown as ConfigService,
        prisma,
        records,
      );
    });

    it('checkout responde 503 em vez de quebrar', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await expect(service.createCheckout(USER.id, 'STANDARD')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('cancelImmediately de quem nao assina nao depende da Stripe', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await expect(service.cancelImmediately(USER.id)).resolves.toBeUndefined();
    });

    it('isConfigured indica o estado', () => {
      expect(service.isConfigured).toBe(false);
    });
  });

  describe('constructEvent', () => {
    it('rejeita payload com assinatura invalida', () => {
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('signature mismatch');
      });

      expect(() =>
        service.constructEvent(Buffer.from('{}'), 'sig_invalida'),
      ).toThrow(BadRequestException);
    });
  });
});
