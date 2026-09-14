import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan } from 'generated/prisma/enums';
import Stripe from 'stripe';
import { PrismaService } from 'src/prisma/prisma.service';
import { PaymentRecordService } from './payment-record.service';
import { PLAN_CONFIG } from './plan.config';
import { STRIPE_CLIENT } from './stripe.provider';

/**
 * Direito de arrependimento (CDC Art. 49): 7 dias corridos para desistir de
 * contratacao feita fora do estabelecimento comercial, com reembolso integral.
 */
export const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Chamadas a Stripe dentro do webhook. O default do SDK (80s, com retries)
 * passa do tempo que a Stripe espera pela resposta do endpoint — melhor
 * falhar rapido e deixar a propria Stripe reentregar o evento.
 */
const WEBHOOK_REQUEST_OPTIONS = { timeout: 10_000, maxNetworkRetries: 0 };

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
   *
   * Duas protecoes contra assinatura em dobro:
   * - quem ja tem assinatura viva recebe 409 (trocar de plano nao e checkout
   *   novo — a assinatura antiga ficaria orfa, cobrando todo mes);
   * - a sessao de checkout anterior e expirada antes de abrir outra. Sem
   *   isso, duas abas de /plans (ou um duplo clique) abrem duas sessoes antes
   *   de qualquer webhook chegar, e as duas podem ser pagas.
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

    if (user.stripeSubscriptionId && user.subscriptionStatus !== 'canceled') {
      throw new ConflictException('User already has an active subscription');
    }

    await this.releasePreviousCheckout(user.stripeCheckoutSessionId);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL');

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${frontendUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/plans`,
      // A ponte entre a Stripe e o nosso banco: o webhook de conclusao nao
      // sabe quem e o usuario, so devolve o que colocamos aqui.
      metadata: { userId: user.id, plan },
      // Tambem na propria assinatura: a Stripe nao garante ordem de eventos,
      // e o invoice.payment_succeeded da primeira fatura pode chegar ANTES do
      // checkout.session.completed — quando o stripeCustomerId ainda nao foi
      // gravado. A fatura sempre aponta para a assinatura, entao a metadata
      // dela e o unico caminho independente de ordem ate o usuario.
      subscription_data: { metadata: { userId: user.id, plan } },
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

    await this.prismaService.user.update({
      where: { id: user.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return { url: session.url };
  }

  /**
   * Garante no maximo uma sessao de checkout aberta por usuario.
   * - aberta: expira (quem nao pagou ainda nao consegue mais pagar por ela);
   * - concluida: o pagamento ja aconteceu e o webhook ainda nao chegou — abrir
   *   outra seria cobrar duas vezes;
   * - expirada ou inexistente: nada a fazer.
   */
  private async releasePreviousCheckout(sessionId: string | null) {
    if (!sessionId) return;

    let previous: Stripe.Checkout.Session;

    try {
      previous = await this.stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      // Sessao apagada ou de outra conta/ambiente da Stripe: nao ha o que liberar.
      return;
    }

    if (previous.status === 'complete') {
      throw new ConflictException('Previous checkout is still being processed');
    }

    if (previous.status === 'open') {
      try {
        await this.stripe.checkout.sessions.expire(sessionId);
      } catch {
        // Foi paga entre o retrieve e o expire.
        throw new ConflictException(
          'Previous checkout is still being processed',
        );
      }
    }
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
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
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
   *
   * Idempotente contra reentrega: o filtro so casa se o usuario ainda NAO
   * estiver com esta assinatura. Na segunda entrega do mesmo evento nada
   * muda, e os creditos nao sao concedidos de novo.
   *
   * Evento sem metadata ou de usuario que nao existe e ignorado com log, nao
   * com erro: um 4xx/5xx aqui faria a Stripe reentregar para sempre algo que
   * nunca vai dar certo.
   */
  private async handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan as Plan | undefined;
    const subscriptionId = this.idOf(session.subscription);

    if (!userId || !plan || !PLAN_CONFIG[plan] || !subscriptionId) {
      this.logger.warn(
        `Checkout ${session.id} sem metadata/assinatura validas: ignorado`,
      );
      return;
    }

    const { count } = await this.prismaService.user.updateMany({
      where: {
        id: userId,
        OR: [
          { stripeSubscriptionId: null },
          { stripeSubscriptionId: { not: subscriptionId } },
        ],
      },
      data: {
        stripeCustomerId: this.idOf(session.customer),
        stripeSubscriptionId: subscriptionId,
        stripeCheckoutSessionId: null,
        subscriptionStatus: 'active',
        plan,
        // increment e atomico no banco: ler-somar-escrever perderia updates
        // se dois eventos chegassem ao mesmo tempo.
        credits: { increment: PLAN_CONFIG[plan].credits },
      },
    });

    if (!count) {
      this.logger.log(
        `Checkout ${session.id}: usuario inexistente ou assinatura ja aplicada`,
      );
    }
  }

  /**
   * Cobranca paga — vale para a primeira fatura E para as renovacoes.
   * Fonte do usuario: stripeCustomerId (a renovacao nao carrega metadata);
   * se ainda nao foi gravado, a metadata da assinatura.
   */
  private async handleInvoicePaid(invoice: Stripe.Invoice) {
    const customerId = this.idOf(invoice.customer);
    const subscriptionId = this.subscriptionIdOf(invoice);

    const user =
      (customerId
        ? await this.prismaService.user.findUnique({
            where: { stripeCustomerId: customerId },
          })
        : null) ?? (await this.userFromSubscriptionMetadata(subscriptionId));

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
      stripeSubscriptionId: subscriptionId,
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
   * Fallback de handleInvoicePaid para quando a fatura chega antes do
   * checkout.session.completed. Falha de rede aqui vira 503 — de proposito:
   * a Stripe reentrega, e na proxima o checkout provavelmente ja foi
   * processado. Engolir o erro perderia a fatura do historico.
   */
  private async userFromSubscriptionMetadata(subscriptionId: string | null) {
    if (!subscriptionId) return null;

    let subscription: Stripe.Subscription;

    try {
      subscription = await this.stripe.subscriptions.retrieve(
        subscriptionId,
        {},
        WEBHOOK_REQUEST_OPTIONS,
      );
    } catch {
      throw new ServiceUnavailableException(
        `Could not load subscription ${subscriptionId}`,
      );
    }

    const userId = subscription.metadata?.userId;

    if (!userId) return null;

    return this.prismaService.user.findUnique({ where: { id: userId } });
  }

  /**
   * Cobranca recusada. NAO rebaixa o plano: a Stripe ainda vai retentar.
   * past_due e um estado de aviso; a perda de acesso vem no evento de
   * assinatura deletada.
   *
   * Filtra tambem pela assinatura da fatura: uma falha atrasada de uma
   * assinatura antiga nao pode marcar past_due quem ja assinou de novo — nem
   * voltar um "canceled" para "past_due".
   */
  private async handleInvoiceFailed(invoice: Stripe.Invoice) {
    const customerId = this.idOf(invoice.customer);
    const subscriptionId = this.subscriptionIdOf(invoice);

    if (!customerId || !subscriptionId) return;

    // updateMany (e nao update por PK) porque a busca e por ids da Stripe e
    // nao pode estourar quando nao ha match.
    await this.prismaService.user.updateMany({
      where: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      },
      data: { subscriptionStatus: 'past_due' },
    });
  }

  /**
   * Mantem o status em sincronia com mudancas feitas fora do app — por
   * exemplo, o cancelamento agendado sendo desfeito pelo painel da Stripe.
   * Nao mexe em plano: so a assinatura deletada rebaixa.
   */
  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    let status: string | null = null;

    if (subscription.cancel_at_period_end || subscription.cancel_at) {
      status = 'canceling';
    } else if (subscription.status === 'active') {
      status = 'active';
    } else if (
      subscription.status === 'past_due' ||
      subscription.status === 'unpaid'
    ) {
      status = 'past_due';
    }

    if (!status) return;

    await this.prismaService.user.updateMany({
      where: { stripeSubscriptionId: subscription.id },
      data: { subscriptionStatus: status },
    });
  }

  /**
   * Unico evento que efetivamente rebaixa o plano. Cobre o fim do periodo
   * apos cancelamento, falha definitiva de cobranca e cancelamento pelo
   * painel da Stripe.
   *
   * Casa pelo id da assinatura, nao so pelo cliente: um evento atrasado de uma
   * assinatura antiga nao pode rebaixar quem ja assinou de novo.
   */
  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const customerId = this.idOf(subscription.customer);

    if (!customerId || !subscription.id) return;

    await this.prismaService.user.updateMany({
      where: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
      },
      data: {
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        plan: 'FREE',
      },
    });
  }

  // ─── Acoes do usuario ──────────────────────────────────────────────────

  /**
   * Agenda o fim da assinatura para o fim do periodo JA PAGO — nao cancela na
   * hora.
   *
   * Tirar o acesso no clique fica com o dinheiro de um servico que deixou de
   * ser prestado, o tipo de clausula que o CDC (Art. 51, IV) trata como
   * abusiva. O plano continua pago; so o status vira "canceling". O rebaixamento
   * para FREE acontece quando a Stripe dispara customer.subscription.deleted
   * no fim do ciclo.
   *
   * stripeSubscriptionId continua gravado: e por ele que o webhook acha o
   * usuario, e e o que permite retomar antes do fim do periodo.
   */
  async cancelSubscription(userId: string): Promise<{ message: string }> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user?.stripeSubscriptionId) {
      throw new BadRequestException('No active subscription');
    }

    if (user.subscriptionStatus === 'canceling') {
      throw new BadRequestException('Subscription is already set to cancel');
    }

    await this.stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await this.prismaService.user.update({
      where: { id: userId },
      data: { subscriptionStatus: 'canceling' },
    });

    return { message: 'Subscription will cancel at the end of the period' };
  }

  /** Desfaz o cancelamento agendado, enquanto o periodo pago nao acabou. */
  async resumeSubscription(userId: string): Promise<{ message: string }> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (
      !user?.stripeSubscriptionId ||
      user.subscriptionStatus !== 'canceling'
    ) {
      throw new BadRequestException('No subscription scheduled to cancel');
    }

    await this.stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });

    await this.prismaService.user.update({
      where: { id: userId },
      data: { subscriptionStatus: 'active' },
    });

    return { message: 'Subscription resumed' };
  }

  /**
   * Encerra a assinatura AGORA, sem periodo restante.
   *
   * Para os casos em que manter o periodo pago nao faz sentido: exclusao de
   * conta (nao sobra conta para usar) e reembolso (o dinheiro volta, o acesso
   * vai junto). Sem assinatura, nao faz nada.
   */
  async cancelImmediately(userId: string): Promise<void> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user?.stripeSubscriptionId) return;

    try {
      await this.stripe.subscriptions.cancel(user.stripeSubscriptionId);
    } catch (error) {
      // Ja cancelada/apagada na Stripe: o estado local so precisa alcancar.
      const missing =
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === 'resource_missing';
      if (!missing) throw error;
    }

    await this.prismaService.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        plan: 'FREE',
      },
    });
  }

  /**
   * Direito de arrependimento (CDC Art. 49): reembolso integral da cobranca
   * mais recente, sem justificativa, se feita ha no maximo 7 dias.
   *
   * Ordem importa: reembolsa na Stripe primeiro, depois mexe no estado local.
   * Um reembolso que falha deixa o cliente pago e intocado — a direcao segura
   * de falhar. A idempotency key impede reembolso duplo se a pessoa repetir
   * o pedido depois de uma falha no meio do caminho.
   */
  async refundLatestPayment(userId: string) {
    const payment = await this.prismaService.payment.findFirst({
      where: { userId, status: 'PAID' },
      orderBy: { paidAt: 'desc' },
    });

    if (!payment || Date.now() - payment.paidAt.getTime() > REFUND_WINDOW_MS) {
      throw new BadRequestException(
        'No charge eligible for refund (7-day window)',
      );
    }

    // O Payment guarda a fatura, mas o reembolso e feito sobre o
    // PaymentIntent por tras dela.
    const { data } = await this.stripe.invoicePayments.list({
      invoice: payment.stripeInvoiceId,
      status: 'paid',
      limit: 1,
    });

    const paymentIntent = this.idOf(data[0]?.payment?.payment_intent);

    if (!paymentIntent) {
      throw new UnprocessableEntityException(
        'Original charge not found; contact support',
      );
    }

    await this.stripe.refunds.create(
      { payment_intent: paymentIntent },
      { idempotencyKey: `refund-${payment.id}` },
    );

    const refunded = await this.prismaService.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED' },
    });

    await this.cancelImmediately(userId);

    // Os creditos daquela cobranca voltam junto com o dinheiro. GREATEST
    // porque parte deles pode ja ter sido consumida.
    const granted = PLAN_CONFIG[payment.plan]?.credits ?? 0;
    if (granted) {
      await this.prismaService.$executeRaw`
        UPDATE "User" SET "credits" = GREATEST("credits" - ${granted}, 0)
        WHERE "id" = ${userId}
      `;
    }

    return refunded;
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
