"use client";

import { resetConsent } from "@/libs/consent";

/**
 * Revogacao do consentimento (LGPD Art. 8, § 5): apaga a escolha e os cookies
 * de analytics e mostra o banner de novo. Recarrega para descarregar scripts
 * que ja estavam rodando.
 */
export default function CookiePreferences() {
  return (
    <button
      type="button"
      onClick={() => {
        resetConsent();
        window.location.reload();
      }}
      className="inline-flex items-center text-[14px] font-medium text-ink border border-hairline hover:border-ink px-5 py-2.5 rounded-pill transition-colors cursor-pointer"
    >
      Gerenciar preferências de cookies
    </button>
  );
}
