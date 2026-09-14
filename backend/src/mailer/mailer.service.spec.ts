const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: sendMock } })),
}));

import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from './mailer.service';

const configWith = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const CONFIGURED = {
  RESEND_API_KEY: 're_test_123',
  MAIL_FROM: 'Acme <no-reply@acme.com>',
  NODE_ENV: 'development',
};

const MESSAGE = {
  to: 'a@b.com',
  subject: 'Oi',
  html: '<a href="https://x/y">y</a>',
};

describe('MailerService', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  it('envia pelo Resend com o remetente configurado', async () => {
    await new MailerService(configWith(CONFIGURED)).sendMail(MESSAGE);

    expect(sendMock).toHaveBeenCalledWith({
      from: 'Acme <no-reply@acme.com>',
      to: 'a@b.com',
      subject: 'Oi',
      html: MESSAGE.html,
    });
  });

  it('repassa o replyTo quando informado', async () => {
    await new MailerService(configWith(CONFIGURED)).sendMail({
      ...MESSAGE,
      replyTo: 'cliente@b.com',
    });

    expect(sendMock.mock.calls[0][0]).toMatchObject({
      replyTo: 'cliente@b.com',
    });
  });

  // O SDK devolve { error } em vez de lancar: ignorar isso sumia com a falha.
  it('transforma o erro devolvido pelo Resend em 503', async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: 'domain not verified', name: 'validation_error' },
    });

    await expect(
      new MailerService(configWith(CONFIGURED)).sendMail(MESSAGE),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('sem RESEND_API_KEY fora de producao, nao envia e nao quebra o fluxo', async () => {
    const service = new MailerService(configWith({ NODE_ENV: 'development' }));

    await expect(service.sendMail(MESSAGE)).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sem RESEND_API_KEY em producao, falha com 503 em vez de engolir', async () => {
    const service = new MailerService(configWith({ NODE_ENV: 'production' }));

    await expect(service.sendMail(MESSAGE)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
