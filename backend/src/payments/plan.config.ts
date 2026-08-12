import { Plan } from 'generated/prisma/enums';

/**
 * Mapa de configuracao dos planos. Vive em codigo, nao no banco: e regra de
 * negocio versionada junto com o resto, nao dado editavel em runtime.
 *
 * `priceEnvKey` guarda a CHAVE da variavel de ambiente, nunca o Price ID em
 * si — os IDs mudam entre a conta de teste e a de producao, entao o valor e
 * resolvido em runtime. `null` significa que o plano nao passa por checkout.
 */
export interface PlanDefinition {
  /** Creditos concedidos a cada cobranca paga. 0 desliga a concessao. */
  credits: number;
  priceEnvKey: string | null;
}

export const PLAN_CONFIG: Record<Plan, PlanDefinition> = {
  FREE: { credits: 0, priceEnvKey: null },
  STANDARD: { credits: 100, priceEnvKey: 'STRIPE_PRICE_ID_STANDARD' },
  PRO: { credits: 500, priceEnvKey: 'STRIPE_PRICE_ID_PRO' },
};

/** Planos que exigem checkout — os unicos aceitos em POST /payments/checkout. */
export const PAID_PLANS = (Object.keys(PLAN_CONFIG) as Plan[]).filter(
  (plan) => PLAN_CONFIG[plan].priceEnvKey !== null,
);

/** Chaves de env com Price ID, para a validacao de ambiente no boot. */
export const PRICE_ENV_KEYS = PAID_PLANS.map(
  (plan) => PLAN_CONFIG[plan].priceEnvKey!,
);
