import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp, TestContext } from './setup/test-app';
import { uniqueEmail, VALID_PASSWORD } from './setup/fixtures';

/**
 * O resto da suite roda com RATE_LIMIT_ENABLED=false (ver global-setup).
 * Aqui ele volta a valer.
 *
 * Uma aplicacao so para o arquivo (o AppModule fica em cache no Jest e nao
 * aceita um banco novo por teste). O storage do throttler e em memoria e
 * compartilhado entre os testes, entao cada um usa chaves proprias: IPs
 * distintos via X-Client-IP, ou o IP da conexao em um unico teste.
 */
describe('Rate limit (e2e)', () => {
  let ctx: TestContext;
  const http = () => request(ctx.app.getHttpServer() as App);

  const LOGIN_LIMIT = 10;
  const wrongLogin = () =>
    http()
      .post('/auth/login')
      .send({ email: uniqueEmail(), password: VALID_PASSWORD });

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENABLED = 'true';
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
    process.env.RATE_LIMIT_ENABLED = 'false';
  });

  // Atras do Next, todo trafego vem do mesmo IP. Sem X-Client-IP confiavel,
  // um atacante gastaria a cota de login do site inteiro.
  it('conta por X-Client-IP quando o Next se autentica com SERVICE_TOKEN', async () => {
    const fromClient = (ip: string) =>
      wrongLogin()
        .set('X-Service-Token', process.env.SERVICE_TOKEN!)
        .set('X-Client-IP', ip);

    for (let i = 0; i < LOGIN_LIMIT; i++) {
      await fromClient('203.0.113.1').expect(401);
    }

    await fromClient('203.0.113.1').expect(429);

    // Outro visitante continua com a propria cota.
    await fromClient('203.0.113.2').expect(401);
  });

  // Sem o token, o cabecalho e forjavel: trocar de "IP" a cada tentativa nao
  // pode renovar a cota. Todas contam contra o IP real da conexao.
  it('bloqueia com 429 alem do limite, ignorando X-Client-IP sem SERVICE_TOKEN', async () => {
    for (let i = 0; i < LOGIN_LIMIT; i++) {
      await wrongLogin().set('X-Client-IP', `198.51.100.${i}`).expect(401);
    }

    await wrongLogin().set('X-Client-IP', '198.51.100.99').expect(429);
  });

  it('webhook da Stripe fica fora do limite', async () => {
    for (let i = 0; i < 130; i++) {
      const response = await http().post('/payments/webhook').send({});
      expect(response.status).not.toBe(429);
    }
  });
});
