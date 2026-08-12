import { Injectable, NotFoundException } from '@nestjs/common';
import { Plan } from 'generated/prisma/enums';
import { PrismaService } from 'src/prisma/prisma.service';

/**
 * Dados de uma cobranca ja normalizados — sem nenhum tipo da Stripe.
 * Quem traduz o evento bruto para este shape e o PaymentService.
 */
export interface PaymentRecordInput {
  userId: string;
  plan: Plan;
  /** Em centavos. */
  amount: number;
  currency: string;
  stripeInvoiceId: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  hostedInvoiceUrl?: string | null;
  invoicePdfUrl?: string | null;
  paidAt: Date;
}

/**
 * CRUD puro da tabela Payment. NAO importa o SDK da Stripe de proposito: se um
 * dia o gateway mudar, so o PaymentService precisa ser reescrito.
 */
@Injectable()
export class PaymentRecordService {
  constructor(private prismaService: PrismaService) {}

  /**
   * Upsert chaveado por stripeInvoiceId (unique no banco). A Stripe reentrega
   * eventos em caso de timeout; sem o upsert, a mesma fatura viraria duas
   * linhas no historico do usuario.
   */
  upsertByInvoice(input: PaymentRecordInput) {
    const data = {
      userId: input.userId,
      plan: input.plan,
      amount: input.amount,
      currency: input.currency,
      status: 'PAID' as const,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      hostedInvoiceUrl: input.hostedInvoiceUrl ?? null,
      invoicePdfUrl: input.invoicePdfUrl ?? null,
      paidAt: input.paidAt,
    };

    return this.prismaService.payment.upsert({
      where: { stripeInvoiceId: input.stripeInvoiceId },
      create: { ...data, stripeInvoiceId: input.stripeInvoiceId },
      update: data,
    });
  }

  findAll() {
    return this.prismaService.payment.findMany({
      orderBy: { paidAt: 'desc' },
    });
  }

  findByUser(userId: string) {
    return this.prismaService.payment.findMany({
      where: { userId },
      orderBy: { paidAt: 'desc' },
    });
  }

  async remove(id: string) {
    const payment = await this.prismaService.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return this.prismaService.payment.delete({ where: { id } });
  }
}
