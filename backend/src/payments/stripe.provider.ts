import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

export const STRIPE_CLIENT = 'STRIPE_CLIENT';

/**
 * Versao da API fixada explicitamente: sem isso, a Stripe promove a conta para
 * a versao mais nova e o formato dos eventos muda sem aviso, em producao.
 * Ao subir esta versao, releia o changelog dos eventos tratados em
 * PaymentService.
 */
export const STRIPE_API_VERSION = '2026-07-29.dahlia';

/**
 * Cliente Stripe como singleton do modulo. `null` quando STRIPE_SECRET_KEY nao
 * esta configurada — o boilerplate roda sem pagamentos, e as rotas que
 * dependem da Stripe respondem 503 (ver PaymentService.stripe).
 */
export const stripeProvider = {
  provide: STRIPE_CLIENT,
  inject: [ConfigService],
  useFactory: (configService: ConfigService): Stripe | null => {
    const secretKey = configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      return null;
    }

    return new Stripe(secretKey, {
      apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion,
    });
  },
};
