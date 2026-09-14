import { useSyncExternalStore } from "react";

// Consentimento de cookies nao essenciais (LGPD Art. 7, I e Art. 8).
//
// Mora no localStorage, nao em cookie: gravar um cookie para lembrar que a
// pessoa recusou cookies seria contraditorio, e o valor nunca precisa ir ao
// servidor.

export type ConsentValue = "granted" | "denied";

/**
 * Versionado: ao adicionar uma ferramenta nova que grava cookie (pixel,
 * chat...), troque o sufixo. Consentimentos antigos deixam de valer e o banner
 * volta — consentimento dado para GA nao cobre uma ferramenta que nao existia.
 */
const STORAGE_KEY = "cookie-consent:v1";
const CHANGE_EVENT = "cookie-consent-change";

export function readConsent(): ConsentValue | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    // Modo privado de alguns navegadores bloqueia o storage.
    return null;
  }
}

export function writeConsent(value: ConsentValue): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Sem storage, a escolha vale so para esta pagina.
  }

  if (value === "denied") removeAnalyticsCookies();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Revogacao (LGPD Art. 8, § 5): tem que ser tao facil quanto consentir.
 * Volta o banner e apaga os cookies de analytics ja gravados.
 */
export function resetConsent(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem
  }

  removeAnalyticsCookies();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Apaga os cookies do Google Analytics (_ga, _ga_XXXX) do dominio atual. */
function removeAnalyticsCookies(): void {
  const host = window.location.hostname;
  const domains = ["", host, `.${host.replace(/^www\./, "")}`];

  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (!name.startsWith("_ga")) continue;

    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  }
}

function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/**
 * Consentimento atual. `undefined` no servidor e antes da hidratacao — quem
 * usa nao deve renderizar nada nesse estado, para nao piscar o banner.
 */
export function useConsent(): ConsentValue | null | undefined {
  return useSyncExternalStore(subscribe, readConsent, () => undefined);
}
