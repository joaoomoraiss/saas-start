import { PRICE_ENV_KEYS } from 'src/payments/plan.config';

const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_VERIFY_SECRET',
  'JWT_FORGOT_SECRET',
  'FRONTEND_URL',
] as const;

const SECRETS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_VERIFY_SECRET',
  'JWT_FORGOT_SECRET',
] as const;

const MIN_SECRET_LENGTH = 32;

/**
 * Grupo da Stripe: tudo-ou-nada.
 *
 * Pagamentos sao opcionais num boilerplate — sem STRIPE_SECRET_KEY o modulo
 * sobe e as rotas respondem 503. O que nao pode existir e configuracao pela
 * METADE: uma chave sem o segredo do webhook aceita checkout e nunca libera o
 * plano, e isso so aparece depois do primeiro cliente pagar. Por isso, se
 * qualquer variavel do grupo estiver presente, todas passam a ser exigidas.
 */
const STRIPE_GROUP = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  ...PRICE_ENV_KEYS,
] as const;

/**
 * Validacao de ambiente executada no boot, antes de qualquer requisicao.
 *
 * Um boilerplate e clonado e configurado as pressas: sem isto, um secret
 * ausente vira `undefined` silenciosamente e a aplicacao passa a assinar
 * tokens sem seguranca real. Aqui o processo morre na largada.
 */
export function validateEnv(config: Record<string, unknown>) {
  const errors: string[] = [];

  for (const key of REQUIRED) {
    if (!config[key]) {
      errors.push(`${key} nao definido`);
    }
  }

  for (const key of SECRETS) {
    const value = config[key];
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length < MIN_SECRET_LENGTH
    ) {
      errors.push(
        `${key} tem ${value.length} caracteres, minimo ${MIN_SECRET_LENGTH} (use: openssl rand -hex 32)`,
      );
    }
  }

  // Secrets repetidos anulam a separacao por tipo de token: um link de
  // confirmacao de e-mail voltaria a ser aceito como token de acesso.
  const used = new Map<string, string>();
  for (const key of SECRETS) {
    const value = config[key];
    if (typeof value !== 'string' || !value) continue;
    const previous = used.get(value);
    if (previous) {
      errors.push(
        `${key} tem o mesmo valor de ${previous}; cada token precisa do seu proprio secret`,
      );
    } else {
      used.set(value, key);
    }
  }

  const stripeConfigured = STRIPE_GROUP.filter((key) => config[key]);

  if (
    stripeConfigured.length &&
    stripeConfigured.length < STRIPE_GROUP.length
  ) {
    const missing = STRIPE_GROUP.filter((key) => !config[key]);
    errors.push(
      `configuracao da Stripe incompleta: falta ${missing.join(', ')}. ` +
        `Defina todas as variaveis do grupo ou nenhuma (pagamentos desligados).`,
    );
  }

  if (errors.length) {
    throw new Error(
      `Configuracao de ambiente invalida:\n` +
        errors.map((e) => `  - ${e}`).join('\n') +
        `\n\nCopie .env.example para .env e preencha os valores.`,
    );
  }

  return config;
}
