import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { createServer } from 'node:net';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'prisma', 'migrations');

export interface InMemoryPostgres {
  url: string;
  stop: () => Promise<void>;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Aplica as migrations reais do repositorio, em ordem.
 *
 * Usar os arquivos de migration em vez de um `db push` a partir do schema faz
 * a suite quebrar quando uma migration diverge do schema — que e exatamente o
 * tipo de defeito que so aparece no deploy.
 */
async function applyMigrations(db: PGlite): Promise<void> {
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migration of migrations) {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, migration, 'migration.sql'),
      'utf8',
    );
    await db.exec(sql);
  }
}

/**
 * Sobe um Postgres em memoria (PGlite) exposto no protocolo de rede do
 * Postgres.
 *
 * O socket e o ponto central do desenho: o codigo sob teste continua usando
 * o mesmo PrismaClient e o mesmo @prisma/adapter-pg da producao, sem nenhum
 * ramo condicional "se for teste". A unica diferenca e o DATABASE_URL.
 */
export async function startInMemoryPostgres(): Promise<InMemoryPostgres> {
  const db = await PGlite.create('memory://');
  await applyMigrations(db);

  const port = await findFreePort();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();

  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
