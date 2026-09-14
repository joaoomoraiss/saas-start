"use client";

// Banner de consentimento de cookies.
//
// "Recusar" tem o mesmo peso visual de "Aceitar" de proposito: botao de
// recusa escondido ou apagado torna o consentimento nao-livre, e portanto
// invalido (LGPD Art. 8, § 3). Enquanto nao ha resposta, nada nao essencial
// roda — ver components/analytics.

import Link from "next/link";
import { useConsent, writeConsent } from "@/libs/consent";

export default function CookieConsent() {
  const consent = useConsent();

  // undefined: ainda hidratando. Valor salvo: pessoa ja respondeu.
  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies"
      className="fixed bottom-4 left-4 right-4 z-[80] mx-auto max-w-2xl bg-canvas border border-hairline rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.08)] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4"
    >
      <p className="text-[13px] text-ink/65 leading-relaxed flex-1">
        Usamos cookies essenciais para manter você conectado e, com a sua
        permissão, cookies de análise para entender o uso do site. Saiba mais na{" "}
        <Link
          href="/politica-de-cookies"
          className="text-accent font-medium hover:underline"
        >
          política de cookies
        </Link>
        .
      </p>
      <div className="flex gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => writeConsent("denied")}
          className="text-[13px] font-medium text-ink border border-hairline hover:border-ink px-4 py-2 rounded-pill transition-colors cursor-pointer"
        >
          Recusar
        </button>
        <button
          type="button"
          onClick={() => writeConsent("granted")}
          className="text-[13px] font-medium text-ink border border-hairline hover:border-ink px-4 py-2 rounded-pill transition-colors cursor-pointer"
        >
          Aceitar
        </button>
      </div>
    </div>
  );
}
