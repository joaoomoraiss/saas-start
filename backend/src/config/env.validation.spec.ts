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
});
