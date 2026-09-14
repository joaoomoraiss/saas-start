import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepMockProxy, mockDeep, mock, MockProxy } from 'jest-mock-extended';
import { MailerService } from 'src/mailer/mailer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let mailerService: MockProxy<MailerService>;
  let prisma: DeepMockProxy<PrismaService>;
  let config: Record<string, string | undefined>;

  const lastMessage = () => mailerService.sendMail.mock.calls[0][0];

  beforeEach(() => {
    mailerService = mock<MailerService>();
    prisma = mockDeep<PrismaService>();
    config = {
      FRONTEND_URL: 'https://app.exemplo.com',
      APP_NAME: 'Acme',
      CONTACT_EMAIL: 'equipe@acme.com',
    };
    service = new MailService(mailerService, prisma, {
      get: (key: string) => config[key],
    } as unknown as ConfigService);
  });

  describe('sendUserConfirmation', () => {
    it('monta o link de confirmacao no frontend com o token', async () => {
      await service.sendUserConfirmation('a@b.com', 'verify-token');

      expect(lastMessage().to).toBe('a@b.com');
      expect(lastMessage().subject).toContain('Acme');
      expect(lastMessage().html).toContain(
        'https://app.exemplo.com/confirm?token=verify-token',
      );
    });
  });

  describe('sendPasswordReset', () => {
    it('monta o link de reset no frontend com o token', async () => {
      await service.sendPasswordReset('a@b.com', 'reset-token');

      expect(lastMessage().to).toBe('a@b.com');
      expect(lastMessage().html).toContain(
        'https://app.exemplo.com/reset-password?token=reset-token',
      );
    });

    it('nao usa a rota de confirmacao para reset', async () => {
      await service.sendPasswordReset('a@b.com', 'reset-token');

      expect(lastMessage().html).not.toContain('/confirm?');
    });
  });

  describe('sendContactMessage', () => {
    const contato = {
      name: 'Maria',
      email: 'maria@cliente.com',
      message: 'Quero saber mais sobre o plano Pro.',
    };

    it('envia para a caixa da equipe com resposta para quem escreveu', async () => {
      await service.sendContactMessage(contato);

      expect(lastMessage()).toMatchObject({
        to: 'equipe@acme.com',
        replyTo: 'maria@cliente.com',
      });
      expect(lastMessage().html).toContain('Quero saber mais');
    });

    it('escapa o HTML vindo do formulario', async () => {
      await service.sendContactMessage({
        ...contato,
        name: '<img src=x onerror=alert(1)>',
        message: '<script>alert(1)</script> mensagem longa',
      });

      expect(lastMessage().html).not.toContain('<script>');
      expect(lastMessage().html).not.toContain('<img src=x');
      expect(lastMessage().html).toContain('&lt;script&gt;');
    });

    it('responde 503 quando CONTACT_EMAIL nao esta configurado', async () => {
      config.CONTACT_EMAIL = undefined;

      await expect(service.sendContactMessage(contato)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(mailerService.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('saveEmail', () => {
    it('persiste endereco e botao', async () => {
      await service.saveEmail({ address: 'a@b.com', button: 'BUY' as any });

      expect(prisma.email.create).toHaveBeenCalledWith({
        data: { address: 'a@b.com', button: 'BUY' },
      });
    });
  });
});
