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

  if (errors.length) {
    throw new Error(
      `Configuracao de ambiente invalida:\n` +
        errors.map((e) => `  - ${e}`).join('\n') +
        `\n\nCopie .env.example para .env e preencha os valores.`,
    );
  }

  return config;
}
