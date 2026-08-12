import { BadRequestException } from '@nestjs/common';
import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import Stripe from 'stripe';
import { AuthenticatedRequest } from 'src/common/types/authenticated-request';
import { PaymentRecordService } from './payment-record.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

const REQUEST = { user: { id: 'user-1' } } as AuthenticatedRequest;

describe('PaymentsController', () => {
  let controller: PaymentsController;
  let payments: DeepMockProxy<PaymentsService>;
  let records: DeepMockProxy<PaymentRecordService>;

  beforeEach(() => {
    payments = mockDeep<PaymentsService>();
    records = mockDeep<PaymentRecordService>();
    controller = new PaymentsController(payments, records);
  });

  describe('webhook', () => {
    const rawBody = Buffer.from('{"id":"evt_1"}');

    it('recusa requisicao sem header de assinatura', async () => {
      await expect(controller.webhook({ rawBody } as any, '')).rejects.toThrow(
        BadRequestException,
      );
      expect(payments.constructEvent).not.toHaveBeenCalled();
    });

    it('recusa quando o corpo bruto nao chegou', async () => {
      await expect(
        controller.webhook({ rawBody: undefined } as any, 'sig'),
      ).rejects.toThrow(BadRequestException);
      expect(payments.constructEvent).not.toHaveBeenCalled();
    });

    it('verifica a assinatura ANTES de processar o evento', async () => {
      payments.constructEvent.mockImplementation(() => {
        throw new BadRequestException('Invalid Stripe signature');
      });

      await expect(
        controller.webhook({ rawBody } as any, 'sig_ruim'),
      ).rejects.toThrow(BadRequestException);
      expect(payments.handleEvent).not.toHaveBeenCalled();
    });

    it('passa os bytes brutos para a verificacao, nao um objeto parseado', async () => {
      const event = { type: 'checkout.session.completed' } as Stripe.Event;
      payments.constructEvent.mockReturnValue(event);

      await controller.webhook({ rawBody } as any, 'sig');

      expect(payments.constructEvent).toHaveBeenCalledWith(rawBody, 'sig');
      expect(payments.handleEvent).toHaveBeenCalledWith(event);
    });
  });

  describe('rotas do proprio usuario', () => {
    it('checkout usa o id do token, nao do body', async () => {
      await controller.createCheckout(REQUEST, { plan: 'STANDARD' });

      expect(payments.createCheckout).toHaveBeenCalledWith(
        'user-1',
        'STANDARD',
      );
    });

    it('cancelamento usa o id do token', async () => {
      await controller.cancel(REQUEST);

      expect(payments.cancelSubscription).toHaveBeenCalledWith('user-1');
    });

    it('minhas cobrancas usa o id do token — nunca um parametro (IDOR)', () => {
      void controller.findMine(REQUEST);

      expect(records.findByUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('rotas de admin', () => {
    it('historico por usuario aceita o id como parametro', () => {
      void controller.findByUser('outro-usuario');

      expect(records.findByUser).toHaveBeenCalledWith('outro-usuario');
    });

    it('listagem geral delega ao record service', () => {
      void controller.findAll();

      expect(records.findAll).toHaveBeenCalled();
    });

    it('remocao delega ao record service', () => {
      void controller.remove('pay-1');

      expect(records.remove).toHaveBeenCalledWith('pay-1');
    });
  });
});
