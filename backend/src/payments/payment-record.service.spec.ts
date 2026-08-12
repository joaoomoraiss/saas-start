import { NotFoundException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentRecordService } from './payment-record.service';

const INPUT = {
  userId: 'user-1',
  plan: 'STANDARD' as const,
  amount: 4900,
  currency: 'brl',
  stripeInvoiceId: 'in_1',
  stripeCustomerId: 'cus_1',
  stripeSubscriptionId: 'sub_1',
  hostedInvoiceUrl: 'https://stripe.test/receipt',
  invoicePdfUrl: 'https://stripe.test/receipt.pdf',
  paidAt: new Date('2026-08-12T10:00:00Z'),
};

describe('PaymentRecordService', () => {
  let service: PaymentRecordService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    service = new PaymentRecordService(prisma);
  });

  describe('upsertByInvoice', () => {
    it('chaveia por stripeInvoiceId: reentrega atualiza em vez de duplicar', async () => {
      await service.upsertByInvoice(INPUT);

      const args = prisma.payment.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ stripeInvoiceId: 'in_1' });
      expect(args.create).toMatchObject({ stripeInvoiceId: 'in_1' });
      expect(args.update).toMatchObject({ amount: 4900 });
    });

    it('guarda o valor em centavos, sem converter', async () => {
      await service.upsertByInvoice(INPUT);

      const args = prisma.payment.upsert.mock.calls[0][0];
      expect((args.create as { amount: number }).amount).toBe(4900);
    });

    it('normaliza campos opcionais ausentes para null', async () => {
      await service.upsertByInvoice({
        ...INPUT,
        hostedInvoiceUrl: undefined,
        invoicePdfUrl: undefined,
        stripeCustomerId: undefined,
        stripeSubscriptionId: undefined,
      });

      const create = prisma.payment.upsert.mock.calls[0][0].create as Record<
        string,
        unknown
      >;
      expect(create.hostedInvoiceUrl).toBeNull();
      expect(create.invoicePdfUrl).toBeNull();
      expect(create.stripeCustomerId).toBeNull();
      expect(create.stripeSubscriptionId).toBeNull();
    });
  });

  describe('listagens', () => {
    it('ordena o historico do usuario por paidAt desc', async () => {
      await service.findByUser('user-1');

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { paidAt: 'desc' },
      });
    });

    it('ordena a listagem geral por paidAt desc', async () => {
      await service.findAll();

      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        orderBy: { paidAt: 'desc' },
      });
    });
  });

  describe('remove', () => {
    it('404 quando o registro nao existe', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.remove('nao-existe')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.payment.delete).not.toHaveBeenCalled();
    });

    it('remove quando existe', async () => {
      prisma.payment.findUnique.mockResolvedValue({ id: 'pay-1' } as any);

      await service.remove('pay-1');

      expect(prisma.payment.delete).toHaveBeenCalledWith({
        where: { id: 'pay-1' },
      });
    });
  });
});
