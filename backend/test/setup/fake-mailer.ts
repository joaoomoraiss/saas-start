import { MailerService, MailMessage } from 'src/mailer/mailer.service';

export type SentMail = MailMessage;

/**
 * Substitui o transporte (Resend), mantendo MailService e seus templates reais
 * dentro do teste. Os fluxos de confirmacao e de reset dependem de um token
 * que so existe dentro do e-mail, entao a caixa de saida e o unico jeito
 * honesto de obte-lo — sem expor o token em uma resposta HTTP so para
 * facilitar o teste.
 */
export class FakeMailerService implements Pick<MailerService, 'sendMail'> {
  readonly outbox: SentMail[] = [];

  sendMail(message: MailMessage): Promise<void> {
    this.outbox.push(message);
    return Promise.resolve();
  }

  clear(): void {
    this.outbox.length = 0;
  }

  lastMailTo(to: string): SentMail | undefined {
    return [...this.outbox].reverse().find((mail) => mail.to === to);
  }

  /** Extrai o token do link presente no ultimo e-mail enviado ao endereco. */
  tokenFor(to: string): string {
    const mail = this.lastMailTo(to);

    if (!mail) {
      throw new Error(`Nenhum e-mail enviado para ${to}`);
    }

    const match = mail.html.match(/token=([^"&\s<]+)/);

    if (!match) {
      throw new Error(`Nenhum token encontrado no e-mail para ${to}`);
    }

    return decodeURIComponent(match[1]);
  }
}
