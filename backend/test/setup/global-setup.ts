import { randomBytes } from 'node:crypto';

const secret = () => randomBytes(32).toString('hex');

/**
 * Roda uma vez, no processo principal do Jest, antes de qualquer worker.
 * Os workers sao forkados depois e herdam este process.env.
 *
 * O banco NAO e criado aqui: cada arquivo de teste sobe a sua propria
 * instancia em memoria (ver createTestApp), de modo que nenhum arquivo
 * dependa do estado deixado por outro.
 */
export default function globalSetup() {
  // Arquivo inexistente de proposito: a configuracao de teste vem toda daqui,
  // e um .env de desenvolvimento nunca e lido pela suite — em especial o
  // DATABASE_URL, que apontaria para o banco real.
  process.env.ENV_FILE = '.env.test.nonexistent';

  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = 'http://localhost:5173';

  // Secrets distintos por execucao: se algum teste passar a depender de um
  // valor fixo, ele quebra aqui em vez de esconder um acoplamento.
  process.env.JWT_SECRET = secret();
  process.env.JWT_REFRESH_SECRET = secret();
  process.env.JWT_VERIFY_SECRET = secret();
  process.env.JWT_FORGOT_SECRET = secret();

  process.env.ACCESS_TOKEN_TTL = '15m';
  process.env.REFRESH_TOKEN_TTL_DAYS = '30';
  process.env.REQUIRE_EMAIL_VERIFICATION = 'false';

  // Placeholder: substituido por arquivo de teste com a URL do banco proprio.
  process.env.DATABASE_URL = 'postgresql://placeholder@127.0.0.1:1/postgres';
}
