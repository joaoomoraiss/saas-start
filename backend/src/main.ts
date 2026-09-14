import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

/**
 * TRUST_PROXY: quantos proxies reversos ficam na frente da API (ex.: "1").
 * Sem isso, atras de um proxy `req.ip` e o IP do proxy, e o rate limit de
 * chamadas diretas (sem passar pelo Next) vira uma cota global.
 */
function trustProxySetting(value: string | undefined): number | boolean {
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value === 'true';
}

/** Opcionais que, vazios em producao, desligam uma protecao em silencio. */
function warnAboutProductionGaps(logger: Logger) {
  if (process.env.NODE_ENV !== 'production') return;

  const gaps: Record<string, string> = {
    TURNSTILE_SECRET_KEY: 'cadastro SEM captcha',
    RESEND_API_KEY: 'e-mails de confirmacao e reset NAO serao enviados',
    CONTACT_EMAIL: 'formulario de contato respondera 503',
  };

  for (const [key, consequence] of Object.entries(gaps)) {
    if (!process.env[key]) {
      logger.warn(`${key} vazia em producao: ${consequence}`);
    }
  }
}

async function bootstrap() {
  // rawBody: true preserva os bytes originais do corpo em req.rawBody. O
  // webhook da Stripe calcula a assinatura sobre o payload exato — um corpo
  // parseado e re-serializado nao bate.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.set('trust proxy', trustProxySetting(process.env.TRUST_PROXY));

  configureApp(app);

  // credentials: true e o que permite o cookie de refresh ir e voltar.
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  warnAboutProductionGaps(new Logger('Bootstrap'));

  await app.listen(process.env.PORT ?? 8080);
}
void bootstrap();
