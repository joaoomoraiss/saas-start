import { DeepMockProxy, mockDeep, mock, MockProxy } from 'jest-mock-extended';
import { MailerService } from 'src/mailer/mailer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from './mail.service';

describe('MailService', () => {
  let service: MailService;
  let mailerService: MockProxy<MailerService>;
  let prisma: DeepMockProxy<PrismaService>;

  const lastTemplate = () => mailerService.sendMail.mock.calls[0][0];
  const lastRecipient = () => mailerService.sendMail.mock.calls[0][1];

  beforeEach(() => {
    mailerService = mock<MailerService>();
    prisma = mockDeep<PrismaService>();
    service = new MailService(mailerService, prisma);
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
  });

  describe('sendUserConfirmation', () => {
    it('monta o link de confirmacao no frontend com o token', async () => {
      await service.sendUserConfirmation('a@b.com', 'verify-token');

      expect(lastRecipient()).toBe('a@b.com');
      expect(lastTemplate()).toContain(
        'https://app.exemplo.com/confirm?token=verify-token',
      );
    });
  });

  describe('sendPasswordReset', () => {
    it('monta o link de reset no frontend com o token', async () => {
      await service.sendPasswordReset('a@b.com', 'reset-token');

      expect(lastRecipient()).toBe('a@b.com');
      expect(lastTemplate()).toContain(
        'https://app.exemplo.com/reset-password?token=reset-token',
      );
    });

    it('nao usa a rota de confirmacao para reset', async () => {
      await service.sendPasswordReset('a@b.com', 'reset-token');

      expect(lastTemplate()).not.toContain('/confirm?');
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
