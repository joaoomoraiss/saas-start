import { validateEnv } from './env.validation';

const valid = () => ({
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(64),
  JWT_REFRESH_SECRET: 'b'.repeat(64),
  JWT_VERIFY_SECRET: 'c'.repeat(64),
  JWT_FORGOT_SECRET: 'd'.repeat(64),
  FRONTEND_URL: 'http://localhost:5173',
});

describe('validateEnv', () => {
  it('aceita uma configuracao completa', () => {
    expect(() => validateEnv(valid())).not.toThrow();
  });

  it.each([
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_VERIFY_SECRET',
    'JWT_FORGOT_SECRET',
    'FRONTEND_URL',
  ])('falha quando %s esta ausente', (key) => {
    const config = valid();
    delete (config as Record<string, unknown>)[key];

    expect(() => validateEnv(config)).toThrow(key);
  });

  it('falha com secret curto demais', () => {
    expect(() => validateEnv({ ...valid(), JWT_SECRET: 'curto' })).toThrow(
      /minimo 32/,
    );
  });

  // Secrets iguais anulam a separacao por proposito: o token de confirmacao
  // de e-mail voltaria a ser aceito como token de acesso.
  it('falha quando dois secrets sao iguais', () => {
    const config = valid();
    config.JWT_VERIFY_SECRET = config.JWT_SECRET;

    expect(() => validateEnv(config)).toThrow(/mesmo valor/);
  });

  it('reporta todos os problemas de uma vez', () => {
    const config = valid();
    delete (config as Record<string, unknown>).DATABASE_URL;
    delete (config as Record<string, unknown>).FRONTEND_URL;

    expect(() => validateEnv(config)).toThrow(
      /DATABASE_URL[\s\S]*FRONTEND_URL/,
    );
  });

  it('devolve a configuracao quando valida', () => {
    const config = valid();

    expect(validateEnv(config)).toBe(config);
  });

  describe('grupo da Stripe (tudo ou nada)', () => {
    const stripe = () => ({
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_WEBHOOK_SECRET: 'whsec_123',
      STRIPE_PRICE_ID_STANDARD: 'price_a',
      STRIPE_PRICE_ID_PRO: 'price_b',
    });

    it('aceita nenhuma variavel da Stripe (pagamentos desligados)', () => {
      expect(() => validateEnv(valid())).not.toThrow();
    });

    it('aceita o grupo completo', () => {
      expect(() => validateEnv({ ...valid(), ...stripe() })).not.toThrow();
    });

    it.each([
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_PRICE_ID_STANDARD',
      'STRIPE_PRICE_ID_PRO',
    ])('falha com o grupo pela metade, faltando %s', (key) => {
      const config = { ...valid(), ...stripe() };
      delete (config as Record<string, unknown>)[key];

      // Meia configuracao aceita checkout e nunca libera o plano — o boot
      // precisa quebrar antes de o primeiro cliente pagar.
      expect(() => validateEnv(config)).toThrow(key);
    });
  });
});
