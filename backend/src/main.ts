import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  // credentials: true e o que permite o cookie de refresh ir e voltar.
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
