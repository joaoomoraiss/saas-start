import { ConfigService } from '@nestjs/config';
import { CaptchaService } from './captcha.service';

const REAL_SECRET = '0x4AAAAAAAsecretdeverdade';
const TEST_SECRET = '1x0000000000000000000000000000000AA';

function serviceWith(values: Record<string, string | undefined>) {
  return new CaptchaService({
    get: (key: string) => values[key],
  } as unknown as ConfigService);
}

function cloudflareReplies(body: Record<string, unknown>, status = 200) {
  return jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe('CaptchaService', () => {
  const config = {
    TURNSTILE_SECRET_KEY: REAL_SECRET,
    FRONTEND_URL: 'https://acme.com.br',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sem secret fica desligado e aprova sem chamar a Cloudflare', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = serviceWith({ FRONTEND_URL: config.FRONTEND_URL });

    expect(service.enabled).toBe(false);
    await expect(
      service.verify(undefined, undefined, 'register'),
    ).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('com secret, recusa pedido sem token sem chamar a Cloudflare', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    await expect(
      serviceWith(config).verify(undefined, '1.2.3.4', 'register'),
    ).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('aprova desafio resolvido no dominio e na tela certos', async () => {
    const fetchSpy = cloudflareReplies({
      success: true,
      hostname: 'acme.com.br',
      action: 'register',
    });

    await expect(
      serviceWith(config).verify('cf-token', '1.2.3.4', 'register'),
    ).resolves.toBe(true);

    const body = fetchSpy.mock.calls[0][1]!.body as URLSearchParams;
    expect(body.get('secret')).toBe(REAL_SECRET);
    expect(body.get('response')).toBe('cf-token');
    expect(body.get('remoteip')).toBe('1.2.3.4');
  });

  it('aceita a variante www do dominio', async () => {
    cloudflareReplies({ success: true, hostname: 'www.acme.com.br' });

    await expect(
      serviceWith(config).verify('cf-token', undefined, 'register'),
    ).resolves.toBe(true);
  });

  // A site key e publica: sem esta checagem o desafio resolvido em outro
  // site seria aceito aqui.
  it('recusa desafio resolvido em outro dominio', async () => {
    cloudflareReplies({ success: true, hostname: 'site-do-atacante.com' });

    await expect(
      serviceWith(config).verify('cf-token', undefined, 'register'),
    ).resolves.toBe(false);
  });

  it('com secret de teste da Cloudflare, nao confere o dominio', async () => {
    cloudflareReplies({ success: true, hostname: 'example.com' });

    await expect(
      serviceWith({ ...config, TURNSTILE_SECRET_KEY: TEST_SECRET }).verify(
        'cf-token',
        undefined,
        'register',
      ),
    ).resolves.toBe(true);
  });

  it('recusa token emitido para outra tela', async () => {
    cloudflareReplies({
      success: true,
      hostname: 'acme.com.br',
      action: 'login',
    });

    await expect(
      serviceWith(config).verify('cf-token', undefined, 'register'),
    ).resolves.toBe(false);
  });

  it('recusa desafio nao resolvido', async () => {
    cloudflareReplies({
      success: false,
      'error-codes': ['invalid-input-response'],
    });

    await expect(
      serviceWith(config).verify('cf-token', undefined, 'register'),
    ).resolves.toBe(false);
  });

  // Falha fechada: instabilidade da Cloudflare nao pode virar bypass.
  it('recusa quando a Cloudflare responde erro HTTP', async () => {
    cloudflareReplies({}, 500);

    await expect(
      serviceWith(config).verify('cf-token', undefined, 'register'),
    ).resolves.toBe(false);
  });

  it('recusa quando a chamada falha na rede', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));

    await expect(
      serviceWith(config).verify('cf-token', undefined, 'register'),
    ).resolves.toBe(false);
  });
});
