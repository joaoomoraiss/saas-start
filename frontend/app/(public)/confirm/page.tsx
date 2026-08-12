import type { Metadata } from "next";
import { Suspense } from "react";
import { siteConfig } from "@/libs/siteConfig";
import ConfirmEmail from "@/components/confirmEmail";

export const metadata: Metadata = {
  title: "Confirmar e-mail",
  description: `Confirme o seu e-mail para liberar todos os recursos do ${siteConfig.name}.`,
  robots: { index: false, follow: false },
};

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <svg
        className="animate-spin text-ink"
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
      >
        <path
          d="M16 3a13 13 0 1 0 13 13"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// Destino do link enviado por e-mail pelo backend:
// `${FRONTEND_URL}/confirm?token=...` (src/mail/mail.service.ts).
export default function ConfirmPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ConfirmEmail />
    </Suspense>
  );
}
