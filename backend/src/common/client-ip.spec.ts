import type { Request } from 'express';
import { clientIp } from './client-ip';
import { isTrustedService } from './service-token';

const TOKEN = 's'.repeat(64);

const request = (headers: Record<string, string>, ip = '10.0.0.5') =>
  ({ headers, ip }) as unknown as Request;

describe('clientIp / isTrustedService', () => {
  const original = process.env.SERVICE_TOKEN;

  beforeEach(() => {
    process.env.SERVICE_TOKEN = TOKEN;
  });

  afterAll(() => {
    process.env.SERVICE_TOKEN = original;
  });

  it('usa X-Client-IP quando vem acompanhado do SERVICE_TOKEN', () => {
    expect(
      clientIp(
        request({ 'x-service-token': TOKEN, 'x-client-ip': '203.0.113.9' }),
      ),
    ).toBe('203.0.113.9');
  });

  // Sem a conferencia, cada requisicao forjaria um IP novo e o rate limit
  // deixaria de existir.
  it('ignora X-Client-IP sem token de servico', () => {
    expect(clientIp(request({ 'x-client-ip': '203.0.113.9' }))).toBe(
      '10.0.0.5',
    );
  });

  it('ignora X-Client-IP com token errado', () => {
    expect(
      clientIp(
        request({ 'x-service-token': 'errado', 'x-client-ip': '203.0.113.9' }),
      ),
    ).toBe('10.0.0.5');
  });

  it('cai no IP da conexao quando o Next nao informa o cliente', () => {
    expect(clientIp(request({ 'x-service-token': TOKEN }))).toBe('10.0.0.5');
  });

  it('falha fechada quando SERVICE_TOKEN nao esta configurado', () => {
    delete process.env.SERVICE_TOKEN;

    expect(isTrustedService('')).toBe(false);
    expect(isTrustedService(undefined)).toBe(false);
    expect(isTrustedService(TOKEN)).toBe(false);
  });
});
