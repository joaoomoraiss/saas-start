import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan } from 'generated/prisma/enums';
import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentRecordService } from './payment-record.service';
import { PLAN_CONFIG } from './plan.config';
import { STRIPE_CLIENT } from './stripe.provider';

/**
 * Tudo que fala com a Stripe + a regra de negocio dos webhooks (que campos do
 * User cada evento atualiza). A persistencia do historico e delegada ao
 * PaymentRecordService, que nao conhece a Stripe.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripeClient: Stripe | null,
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly paymentRecordService: PaymentRecordService,
  ) {}

  /** Pagamentos so funcionam com STRIPE_SECRET_KEY configurada. */
  private get stripe(): Stripe {
    if (!this.stripeClient) {
      throw new ServiceUnavailableException('Payments are not configured');
    }
    return this.stripeClient;
  }

  get isConfigured(): boolean {
    return this.stripeClient !== null;
  }

  // ─── Checkout ──────────────────────────────────────────────────────────

  /**
   * Cria a Checkout Session e devolve a URL hospedada pela Stripe.
   *
   * O cliente manda apenas o NOME do plano; o Price ID e resolvido aqui, a
   * partir da env. Aceitar preco vindo do request deixaria o usuario assinar
   * o plano caro por R$ 1,00.
   */
  async createCheckout(userId: string, plan: Plan): Promise<{ url: string }> {
    const priceEnvKey = PLAN_CONFIG[plan]?.priceEnvKey;

    if (!priceEnvKey) {
      throw new BadRequestException(`Plan ${plan} does not require checkout`);
    }

    const priceId = this.configService.get<string>(priceEnvKey);

    if (!priceId) {
      throw new ServiceUnavailableException(
        `Missing ${priceEnvKey} for plan ${plan}`,
      );
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/plans`,
      // A ponte entre a Stripe e o nosso banco: o webhook de conclusao nao
      // sabe quem e o usuario, so devolve o que colocamos aqui.
      metadata: { userId: user.id, plan },
      // Reutiliza o cliente quando ja existe; senao a Stripe cria um a partir
      // do e-mail. Passar os dois ao mesmo tempo e erro na API.
      ...(user.stripeCustomerId
        ? { customer: user.stripeCustomerId }
        : { customer_email: user.email }),
    });

    if (!session.url) {
      throw new ServiceUnavailableException(
        'Stripe did not return a checkout URL',
      );
    }

    return { url: session.url };
  }

  // ─── Webhook ───────────────────────────────────────────────────────────

  /**
   * Verifica a assinatura criptografica do payload. O endpoint do webhook e
   * publico (a Stripe nao tem nosso token), entao esta e a UNICA autenticacao
   * que ele tem — nada pode ser processado antes de passar por aqui.
   */
  constructEvent(payload: Buffer, signature: string): Stripe.Event {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    if (!webhookSecret) {
      throw new ServiceUnavailableException('Payments are not configured');
    }

    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
  }

  async handleEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoiceFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      default:
        // Responder 200 mesmo assim: senao a Stripe reentrega para sempre.
        this.logger.log(`Unhandled Stripe event: ${event.type}`);
    }
  }

  /**
   * Primeira assinatura. Fonte do usuario: metadata gravada no checkout.
   *
   * Este e o caminho que concede os creditos da assinatura inicial — ver a
   * nota sobre dupla concessao em handleInvoicePaid.
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan as Plan | undefined;

    if (!userId || !plan) {
      throw new BadRequestException('Checkout session is missing metadata');
    }

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        stripeCustomerId: this.idOf(session.customer),
        stripeSubscriptionId: this.idOf(session.subscription),
        subscriptionStatus: 'active',
        plan,
        // increment e atomico no banco: ler-somar-escrever perderia updates
        // se dois eventos chegassem ao mesmo tempo.
        credits: { increment: PLAN_CONFIG[plan]?.credits ?? 0 },
      },
    });
  }

  /**
   * Cobranca paga — vale para a primeira fatura E para as renovacoes.
   * Fonte do usuario: stripeCustomerId (a renovacao nao carrega metadata).
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const customerId = this.idOf(invoice.customer);

    if (!customerId) return;

    const user = await this.prismaService.user.findUnique({
      where: { stripeCustomerId: customerId },
    });

    // Evento orfao (outro ambiente apontando para o mesmo webhook): sai sem
    // erro, senao a Stripe entra em loop de reentrega por causa de um 500.
    if (!user) return;

    const plan = this.planFromInvoice(invoice) ?? user.plan;

    // O historico registra TODAS as faturas, inclusive a primeira.
    await this.paymentRecordService.upsertByInvoice({
      userId: user.id,
      plan,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      stripeInvoiceId: invoice.id,
      stripeCustomerId: customerId,
      stripeSubscriptionId: this.subscriptionIdOf(invoice),
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      invoicePdfUrl: invoice.invoice_pdf,
      paidAt: this.paidAtOf(invoice),
    });

    // A armadilha central deste sistema: a primeira fatura chega com
    // billing_reason "subscription_create" e o checkout.session.completed
    // dispara para a MESMA compra. Creditar nos dois daria creditos em dobro.
    // Regra: checkout concede na assinatura inicial, aqui so nas renovacoes.
    if (invoice.billing_reason === 'subscription_cycle') {
      await this.prismaService.user.update({
        where: { id: user.id },
        data: {
          plan,
          subscriptionStatus: 'active',
          credits: { increment: PLAN_CONFIG[plan]?.credits ?? 0 },
        },
      });
    }
  }

  /**
   * Cobranca recusada. NAO rebaixa o plano: a Stripe ainda vai retentar.
   * past_due e um estado de aviso; a perda de acesso vem no evento de
   * assinatura deletada.
   */
  private async handleInvoiceFailed(invoice: Stripe.Invoice) {
    const customerId = this.idOf(invoice.customer);

    if (!customerId) return;

    // updateMany (e nao update por PK) porque a busca e por stripeCustomerId
    // e nao pode estourar quando nao ha match.
    await this.prismaService.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: { subscriptionStatus: 'past_due' },
    });
  }

  /**
   * Unico evento que efetivamente rebaixa o plano. Cobre cancelamento pelo
   * usuario, falha definitiva de cobranca e cancelamento pelo painel da Stripe.
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const customerId = this.idOf(subscription.customer);

    if (!customerId) return;

    await this.prismaService.user.updateMany({
      where: { stripeCustomerId: customerId },
      data: {
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        plan: 'FREE',
      },
    });
  }

  // ─── Cancelamento pelo usuario ─────────────────────────────────────────

  /**
   * O estado local e atualizado na hora para dar feedback sincrono; o webhook
   * customer.subscription.deleted chega em seguida e aplica exatamente o mesmo
   * estado — os dois caminhos convergem, o que os torna idempotentes entre si.
   */
  async cancelSubscription(userId: string): Promise<{ message: string }> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user?.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription');
    }

    await this.stripe.subscriptions.cancel(user.stripeSubscriptionId);

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        plan: 'FREE',
      },
    });

    return { message: 'Subscription canceled' };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /** A Stripe devolve ora o id, ora o objeto expandido, ora null. */
  private idOf(
    value: string | { id: string } | null | undefined,
  ): string | null {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id;
  }

  private subscriptionIdOf(invoice: Stripe.Invoice): string | null {
    // A partir da API 2025-x a assinatura sai de invoice.subscription e passa
    // a viver em parent.subscription_details.
    return this.idOf(invoice.parent?.subscription_details?.subscription);
  }

  /** Momento do pagamento vem da Stripe (epoch em segundos), nao do servidor. */
  private paidAtOf(invoice: Stripe.Invoice): Date {
    const epoch = invoice.status_transitions?.paid_at ?? invoice.created;
    return new Date(epoch * 1000);
  }

  /**
   * Descobre o plano pelo Price ID da fatura. Necessario porque a renovacao
   * nao carrega metadata — e o caminho inverso do PLAN_CONFIG.
   */
  private planFromInvoice(invoice: Stripe.Invoice): Plan | null {
    const priceId = invoice.lines?.data?.[0]?.pricing?.price_details?.price;

    if (!priceId) return null;

    for (const [plan, definition] of Object.entries(PLAN_CONFIG)) {
      if (!definition.priceEnvKey) continue;

      if (this.configService.get<string>(definition.priceEnvKey) === priceId) {
        return plan as Plan;
      }
    }

    return null;
  }
}
