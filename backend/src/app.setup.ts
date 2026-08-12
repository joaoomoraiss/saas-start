import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';

/**
 * Configuracao aplicada a instancia do Nest, compartilhada entre o bootstrap
 * de producao e os testes e2e.
 *
 * Viver em um lugar so e o que garante que o teste exercita o mesmo pipeline
 * que roda em producao: um ValidationPipe registrado apenas no main.ts
 * deixaria toda a validacao fora da cobertura dos testes.
 */
export function configureApp(app: INestApplication): INestApplication {
  // Necessario para ler o cookie httpOnly em POST /auth/refresh-token.
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist remove campos nao declarados no DTO; sem isso, um PATCH
      // pode carregar propriedades que o DTO nunca previu.
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  return app;
}
