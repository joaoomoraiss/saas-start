/**
 * Suite unitaria: sem banco, sem rede, sem I/O.
 *
 * Cada service e controller e exercitado com as dependencias trocadas por
 * dublês, isolando a regra de negocio. A integracao real entre as pecas e
 * coberta pela suite e2e (test/jest-e2e.js).
 */
/** @type {import('jest').Config} */
module.exports = {
  displayName: 'unit',
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // Resolve os imports absolutos do projeto ('src/...', 'generated/prisma/...'),
  // que dependem do baseUrl do tsconfig.
  moduleDirectories: ['node_modules', '<rootDir>'],
  moduleNameMapper: {
    // O client gerado pelo Prisma importa com extensao .js (exigencia do
    // moduleResolution nodenext) apontando para arquivos .ts.
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/dto/**',
  ],
  coverageDirectory: 'coverage',
};
