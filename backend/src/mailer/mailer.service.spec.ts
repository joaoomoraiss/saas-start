const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'abc' });

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: sendMailMock })) },
}));

import { MailerService } from './mailer.service';

describe('MailerService', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it('envia o html para o destinatario informado', async () => {
    await new MailerService().sendMail('<p>ola</p>', 'a@b.com');

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@b.com', html: '<p>ola</p>' }),
    );
  });

  it('propaga a falha do transporte, em vez de engolir', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP fora do ar'));

    await expect(
      new MailerService().sendMail('<p>ola</p>', 'a@b.com'),
    ).rejects.toThrow('SMTP fora do ar');
  });
});
