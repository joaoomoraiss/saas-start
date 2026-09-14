/**
 * Limites por rota, num lugar so. Cada entrada e o argumento de @Throttle().
 *
 * O limite global (ThrottlerModule em app.module.ts) cobre todo o resto; aqui
 * ficam as rotas em que o custo de errar para o lado frouxo e alto: forca
 * bruta de senha, bombardeio de e-mail, criacao de conta em massa.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const limit = (limit: number, ttl: number) => ({ default: { limit, ttl } });

export const LIMITS = {
  login: limit(10, MINUTE),
  register: limit(10, HOUR),
  /** Cada chamada dispara um e-mail: sem limite, vira arma contra terceiros. */
  sendEmail: limit(5, HOUR),
  resetPassword: limit(10, HOUR),
  refresh: limit(60, MINUTE),
  /** Exige a senha atual: sem limite, e um oraculo de forca bruta. */
  changePassword: limit(5, HOUR),
  deleteAccount: limit(5, HOUR),
  exportData: limit(10, HOUR),
  checkout: limit(10, HOUR),
  subscription: limit(10, HOUR),
  refund: limit(5, HOUR),
  contact: limit(5, HOUR),
} as const;
