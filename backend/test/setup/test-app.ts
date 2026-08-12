import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from 'src/app.setup';
import { MailerService } from 'src/mailer/mailer.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FakeMailerService } from './fake-mailer';
import { startInMemoryPostgres } from './in-memory-postgres';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
  mailer: FakeMailerService;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Sobe a aplicacao inteira contra um Postgres em memoria exclusivo deste
 * arquivo de teste.
 *
 * Um banco por arquivo, e nao um compartilhado: nenhum teste depende do que
 * outro arquivo deixou para tras, e a ordem de execucao deixa de ser uma
 * variavel escondida.
 *
 * Apenas o transporte SMTP e substituido. Guards, ValidationPipe, CASL e
 * Prisma sao os de producao — um teste e2e que troca guards por mocks nao
 * comprova nada sobre autorizacao, que e justamente o que precisa de prova.
 */
export async function createTestApp(): Promise<TestContext> {
  const postgres = await startInMemoryPostgres();

  process.env.DATABASE_URL = postgres.url;

  // Import dinamico de proposito: ConfigModule.forRoot() le o ambiente no
  // momento em que o modulo e carregado. Um import estatico no topo do
  // arquivo congelaria o DATABASE_URL antes de o banco existir.
  const { AppModule } = await import('src/app.module');

  const mailer = new FakeMailerService();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MailerService)
    .useValue(mailer)
    .compile();

  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  const prisma = app.get(PrismaService);

  const reset = async () => {
    // Descoberto do catalogo em vez de uma lista fixa: uma tabela nova entra
    // na limpeza sem que ninguem precise lembrar de atualizar este arquivo.
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    `;

    if (tables.length) {
      const list = tables
        .map(({ tablename }) => `"public"."${tablename}"`)
        .join(', ');
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
      );
    }

    mailer.clear();
  };

  return {
    app,
    prisma,
    mailer,
    reset,
    close: async () => {
      await prisma.$disconnect();
      await app.close();
      await postgres.stop();
    },
  };
}
