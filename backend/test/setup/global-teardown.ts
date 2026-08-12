/**
 * Nada a desligar globalmente: cada arquivo de teste encerra o proprio banco
 * em memoria no seu `close()`. Mantido como ponto de extensao.
 */
export default async function globalTeardown() {}
