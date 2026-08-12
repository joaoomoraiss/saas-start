import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  // rawBody: true preserva os bytes originais do corpo em req.rawBody. O
  // webhook da Stripe calcula a assinatura sobre o payload exato — um corpo
  // parseado e re-serializado nao bate.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  configureApp(app);

  // credentials: true e o que permite o cookie de refresh ir e voltar.
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
