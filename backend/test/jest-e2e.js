/**
 * Suite e2e: aplicacao inteira contra um Postgres em memoria (PGlite).
 *
 * Roda em serie (`--runInBand` no script) porque todos os arquivos
 * compartilham a mesma instancia de banco, criada uma unica vez no
 * globalSetup. E o custo de subir o banco uma vez so em vez de por worker.
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'e2e',
  rootDir: '..',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: {
    // O client gerado pelo Prisma importa com extensao .js (exigencia do
    // moduleResolution nodenext) apontando para arquivos .ts.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  globalSetup: '<rootDir>/test/setup/global-setup.ts',
  globalTeardown: '<rootDir>/test/setup/global-teardown.ts',
  // O boot do Nest mais as migrations no primeiro arquivo passam do default.
  testTimeout: 30000,
};
