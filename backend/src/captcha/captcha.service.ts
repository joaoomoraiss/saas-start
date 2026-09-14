import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 10_000;

/**
 * Identifica a tela protegida. O widget envia e a Cloudflare devolve na
 * verificacao; conferir impede reaproveitar no cadastro um token emitido para
 * outra tela. Ao proteger outra tela, crie uma action nova.
 */
export const CAPTCHA_ACTION_REGISTER = 'register';

/** Secrets de teste documentados pela Cloudflare (sempre aprova/recusa). */
const TEST_SECRET = /^[123]x0{31}AA$/;

interface TurnstileResponse {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: string[];
}

/**
 * Cloudflare Turnstile, e nao reCAPTCHA: o reCAPTCHA grava cookies do Google,
 * o que o torna cookie nao essencial sujeito a consentimento (LGPD). Quem
 * recusasse cookies nao conseguiria criar conta. O Turnstile nao rastreia, e
 * roda para todo mundo sem depender do banner.
 */
@Injectable()
export class CaptchaService {
  private readonly logger = new Logger(CaptchaService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Sem TURNSTILE_SECRET_KEY o captcha fica desligado: e o que deixa o
   * desenvolvimento e os testes rodarem sem conta na Cloudflare. Em producao
   * isso equivale a nao ter captcha — o boot avisa no log.
   */
  get enabled(): boolean {
    return Boolean(this.secret());
  }

  /**
   * Confere tres coisas, nao so `success`:
   * 1. `success` — o desafio foi resolvido;
   * 2. `hostname` — onde foi resolvido. A site key e publica: sem esta
   *    checagem, alguem resolve o desafio no proprio site e reaproveita aqui;
   * 3. `action` — para qual tela o token foi emitido.
   *
   * Falha FECHADA com o captcha ligado: token vazio, HTTP nao-200, timeout ou
   * erro de rede recusam. O contrario transformaria uma instabilidade da
   * Cloudflare em bypass silencioso — justo quando um atacante mais quer isso.
   */
  async verify(
    token: string | undefined,
    remoteIp: string | undefined,
    action: string,
  ): Promise<boolean> {
    const secret = this.secret();

    if (!secret) return true;
    if (!token) return false;

    const body = new URLSearchParams({
      secret,
      response: token,
      // Tokens do Turnstile sao de uso unico. A idempotency key permite
      // repetir a MESMA verificacao apos um timeout sem levar
      // "timeout-or-duplicate" por um token que era valido.
      idempotency_key: randomUUID(),
    });

    if (remoteIp) body.set('remoteip', remoteIp);

    let result: TurnstileResponse;

    try {
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });

      if (!response.ok) {
        this.logger.warn(`Turnstile respondeu HTTP ${response.status}`);
        return false;
      }

      result = (await response.json()) as TurnstileResponse;
    } catch (error) {
      this.logger.warn(`Falha ao verificar o captcha: ${String(error)}`);
      return false;
    }

    if (!result.success) {
      this.logger.log(
        `Captcha recusado: ${(result['error-codes'] ?? []).join(', ')}`,
      );
      return false;
    }

    // As chaves de teste nao estao vinculadas a dominio nenhum; conferir o
    // hostname com elas quebraria o desenvolvimento sem ganho.
    if (
      result.hostname &&
      !TEST_SECRET.test(secret) &&
      !this.allowedHostnames().includes(result.hostname)
    ) {
      this.logger.warn(
        `Captcha resolvido em host inesperado: ${result.hostname}`,
      );
      return false;
    }

    if (result.action && result.action !== action) {
      this.logger.warn(
        `Captcha de outra tela: esperado ${action}, veio ${result.action}`,
      );
      return false;
    }

    return true;
  }

  private secret(): string | undefined {
    return this.configService.get<string>('TURNSTILE_SECRET_KEY') || undefined;
  }

  /** Derivado de FRONTEND_URL: o dominio e a variante com/sem `www`. */
  private allowedHostnames(): string[] {
    try {
      const host = new URL(this.configService.get<string>('FRONTEND_URL')!)
        .hostname;
      const bare = host.replace(/^www\./, '');
      return [bare, `www.${bare}`];
    } catch {
      return [];
    }
  }
}
