import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentRecordService } from './payment-record.service';
import { PaymentsService } from './payments.service';

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
  stripeCustomerId: null,
  stripeSubscriptionId: null,
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
  });

  describe('createCheckout', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(USER as any);
      stripe.checkout.sessions.create.mockResolvedValue({
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

    it('grava userId e plan na metadata (ponte para o webhook)', async () => {
      await service.createCheckout(USER.id, 'PRO');

      const args = stripe.checkout.sessions.create.mock.calls[0][0]!;
      expect(args.metadata).toEqual({ userId: USER.id, plan: 'PRO' });
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
  });

  describe('checkout.session.completed', () => {
    const event = (metadata: Record<string, string> | null) =>
      ({
        type: 'checkout.session.completed',
        data: {
          object: {
            customer: 'cus_1',
            subscription: 'sub_1',
            metadata,
          },
        },
      }) as unknown as Stripe.Event;

    it('recusa sessao sem metadata: nao ha como saber qual conta liberar', async () => {
      await expect(service.handleEvent(event(null))).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('ativa a assinatura e credita a cota do plano', async () => {
      await service.handleEvent(event({ userId: USER.id, plan: 'STANDARD' }));

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: USER.id },
        data: {
          stripeCustomerId: 'cus_1',
          stripeSubscriptionId: 'sub_1',
          subscriptionStatus: 'active',
          plan: 'STANDARD',
          credits: { increment: 100 },
        },
      });
    });

    it('credita via increment atomico, nunca lendo-somando-escrevendo', async () => {
      await service.handleEvent(event({ userId: USER.id, plan: 'PRO' }));

      const data = prisma.user.update.mock.calls[0][0].data as {
        credits: unknown;
      };
      expect(data.credits).toEqual({ increment: 500 });
    });
  });

  describe('invoice.payment_succeeded', () => {
    const event = (overrides: Record<string, unknown> = {}) =>
      ({
        type: 'invoice.payment_succeeded',
        data: { object: invoice(overrides) },
      }) as unknown as Stripe.Event;

    it('ignora evento orfao sem estourar (evita loop de reentrega)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.handleEvent(event())).resolves.toBeUndefined();
      expect(records.upsertByInvoice).not.toHaveBeenCalled();
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
    it('marca past_due sem rebaixar o plano (a Stripe ainda retenta)', async () => {
      await service.handleEvent({
        type: 'invoice.payment_failed',
        data: { object: invoice() },
      } as unknown as Stripe.Event);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_1' },
        data: { subscriptionStatus: 'past_due' },
      });
    });
  });

  describe('customer.subscription.deleted', () => {
    it('rebaixa para FREE e limpa a assinatura', async () => {
      await service.handleEvent({
        type: 'customer.subscription.deleted',
        data: { object: { customer: 'cus_1' } },
      } as unknown as Stripe.Event);

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { stripeCustomerId: 'cus_1' },
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
      service.handleEvent({
        type: 'customer.created',
        data: { object: {} },
      } as unknown as Stripe.Event),
    ).resolves.toBeUndefined();
  });

  describe('cancelSubscription', () => {
    it('recusa quando nao ha assinatura ativa', async () => {
      prisma.user.findUnique.mockResolvedValue(USER as any);

      await expect(service.cancelSubscription(USER.id)).rejects.toThrow(
        BadRequestException,
      );
      expect(stripe.subscriptions.cancel).not.toHaveBeenCalled();
    });

    it('converge para o mesmo estado do webhook de cancelamento', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...USER,
        stripeSubscriptionId: 'sub_1',
      } as any);

      await service.cancelSubscription(USER.id);

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
