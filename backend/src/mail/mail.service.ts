import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailerService } from 'src/mailer/mailer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { EmailDto } from './dto/email.dto';
import { escapeHtml, renderEmail } from './templates';

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
}

@Injectable()
export class MailService {
  constructor(
    private mailerService: MailerService,
    private prismaService: PrismaService,
    private configService: ConfigService,
  ) {}

  async sendUserConfirmation(email: string, token: string) {
    const url = `${this.frontendUrl()}/confirm?token=${encodeURIComponent(token)}`;

    await this.mailerService.sendMail({
      to: email,
      subject: `Confirme seu e-mail · ${this.appName()}`,
      html: renderEmail({
        appName: this.appName(),
        title: 'Confirme seu e-mail',
        paragraphs: [
          `Falta pouco para ativar sua conta no ${escapeHtml(this.appName())}. Clique no botao abaixo para confirmar este endereco.`,
        ],
        action: { label: 'Confirmar e-mail', url },
        footer:
          'O link vale por 24 horas. Se voce nao criou esta conta, ignore este e-mail.',
      }),
    });
  }

  async sendPasswordReset(email: string, token: string) {
    const url = `${this.frontendUrl()}/reset-password?token=${encodeURIComponent(token)}`;

    await this.mailerService.sendMail({
      to: email,
      subject: `Redefinir senha · ${this.appName()}`,
      html: renderEmail({
        appName: this.appName(),
        title: 'Redefinir sua senha',
        paragraphs: [
          'Recebemos um pedido para redefinir a senha da sua conta. Clique no botao abaixo para escolher uma nova.',
        ],
        action: { label: 'Redefinir senha', url },
        footer:
          'O link vale por 1 hora e so pode ser usado uma vez. Se voce nao pediu a troca, ignore este e-mail: sua senha continua a mesma.',
      }),
    });
  }

  /**
   * Mensagem do formulario de contato para a caixa da equipe. `replyTo` e o
   * e-mail de quem escreveu: responder no cliente de e-mail ja vai para a
   * pessoa certa.
   */
  async sendContactMessage({ name, email, message }: ContactMessage) {
    const inbox = this.configService.get<string>('CONTACT_EMAIL');

    if (!inbox) {
      throw new ServiceUnavailableException('Contact form is not configured');
    }

    await this.mailerService.sendMail({
      to: inbox,
      replyTo: email,
      subject: `Contato pelo site: ${name}`,
      html: renderEmail({
        appName: this.appName(),
        title: 'Nova mensagem pelo formulario de contato',
        paragraphs: [
          `<strong>Nome:</strong> ${escapeHtml(name)}<br><strong>E-mail:</strong> ${escapeHtml(email)}`,
          escapeHtml(message).replace(/\n/g, '<br>'),
        ],
        footer: 'Responda este e-mail para falar direto com quem escreveu.',
      }),
    });
  }

  async saveEmail(emailDto: EmailDto) {
    // A validacao do formato ja acontece no ValidationPipe, via EmailDto.
    await this.prismaService.email.create({
      data: {
        address: emailDto.address,
        button: emailDto.button,
      },
    });
  }

  private appName(): string {
    return this.configService.get<string>('APP_NAME') || 'SaaS Start';
  }

  private frontendUrl(): string {
    return this.configService.get<string>('FRONTEND_URL')!.replace(/\/+$/, '');
  }
}
