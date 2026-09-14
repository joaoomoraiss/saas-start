import { PRICE_ENV_KEYS } from 'src/payments/plan.config';

const REQUIRED = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_VERIFY_SECRET',
  'JWT_FORGOT_SECRET',
  'SERVICE_TOKEN',
  'FRONTEND_URL',
] as const;

const SECRETS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_VERIFY_SECRET',
  'JWT_FORGOT_SECRET',
  'SERVICE_TOKEN',
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
 * Grupo do Resend: tudo-ou-nada pelo mesmo motivo. Chave sem remetente
 * falha no primeiro envio; remetente sem chave nao envia nada.
 */
const MAIL_GROUP = ['RESEND_API_KEY', 'MAIL_FROM'] as const;

function checkGroup(
  config: Record<string, unknown>,
  group: readonly string[],
  label: string,
  errors: string[],
) {
  const present = group.filter((key) => config[key]);

  if (present.length && present.length < group.length) {
    const missing = group.filter((key) => !config[key]);
    errors.push(
      `configuracao ${label} incompleta: falta ${missing.join(', ')}. ` +
        `Defina todas as variaveis do grupo ou nenhuma.`,
    );
  }
}

/**
 * A Stripe separa teste e producao pelo prefixo da chave, e nao avisa quando
 * os dois se misturam — os dois modos funcionam, sobre dados diferentes:
 * - chave de teste em producao: o checkout abre e ninguem e cobrado;
 * - chave live fora de producao: um teste local cobra o cartao de alguem.
 */
function checkStripeKeyEnvironment(
  config: Record<string, unknown>,
  errors: string[],
) {
  const key = config.STRIPE_SECRET_KEY;
  if (typeof key !== 'string' || !key) return;

  const production = config.NODE_ENV === 'production';

  if (production && /^(sk|rk)_test_/.test(key)) {
    errors.push(
      'STRIPE_SECRET_KEY e uma chave de TESTE com NODE_ENV=production: o checkout abriria e nunca cobraria ninguem',
    );
  }

  if (!production && /^(sk|rk)_live_/.test(key)) {
    errors.push(
      'STRIPE_SECRET_KEY e uma chave LIVE fora de producao: um teste local cobraria um cartao de verdade',
    );
  }
}

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

  checkGroup(config, STRIPE_GROUP, 'da Stripe', errors);
  checkStripeKeyEnvironment(config, errors);
  checkGroup(config, MAIL_GROUP, 'do Resend', errors);

  if (errors.length) {
    throw new Error(
      `Configuracao de ambiente invalida:\n` +
        errors.map((e) => `  - ${e}`).join('\n') +
        `\n\nCopie .env.example para .env e preencha os valores.`,
    );
  }

  return config;
}
