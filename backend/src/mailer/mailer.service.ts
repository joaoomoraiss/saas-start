import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** Para onde vai a resposta (ex.: e-mail de quem preencheu o contato). */
  replyTo?: string;
}

/**
 * Transporte de e-mail via API do Resend.
 *
 * Sem RESEND_API_KEY:
 * - fora de producao, o e-mail NAO e enviado e os links (confirmacao, reset)
 *   saem no log — da para testar os fluxos sem conta no Resend;
 * - em producao, o envio falha com 503. Engolir em silencio deixaria usuarios
 *   esperando um e-mail que nunca sai.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly client: Resend | null;

  constructor(private readonly configService: ConfigService) {
    const apiKey = configService.get<string>('RESEND_API_KEY');
    this.client = apiKey ? new Resend(apiKey) : null;
  }

  async sendMail(message: MailMessage): Promise<void> {
    if (!this.client) {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException(
          'Email delivery is not configured',
        );
      }

      const links = [...message.html.matchAll(/href="([^"]+)"/g)].map(
        ([, href]) => href,
      );
      this.logger.warn(
        `RESEND_API_KEY ausente: e-mail NAO enviado.\n` +
          `  Para: ${message.to}\n  Assunto: ${message.subject}\n` +
          links.map((link) => `  Link: ${link}`).join('\n'),
      );
      return;
    }

    const { error } = await this.client.emails.send({
      from: this.configService.get<string>('MAIL_FROM')!,
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    });

    // O SDK nao lanca: devolve { error }. Ignorar isso fazia a falha sumir.
    if (error) {
      this.logger.error(
        `Resend recusou o envio para ${message.to}: ${error.message}`,
      );
      throw new ServiceUnavailableException('Email delivery failed');
    }
  }
}
