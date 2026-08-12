"use client";

// app/(private)/success — retorno de SUCESSO do Stripe Checkout
// (${APP_DOMAIN}/success?session_id=...). Página privada: o middleware já
// exige login; além disso, só é acessível com um `session_id` na URL (presente
// apenas quando o Stripe redireciona após o pagamento). Sem ele, mandamos o
// usuário para /plans — ninguém acessa esta página "normalmente".
// A ativação do plano/créditos é assíncrona (webhook), então fazemos polling
// em GET /user/profile até a assinatura refletir como "active". Ver API_ROUTES.md §5.

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getProfile, type UserProfile } from "@/services/user";

const POLL_INTERVAL_MS = 2500;
const MAX_ATTEMPTS = 24; // ~60s

type Phase = "checking" | "confirmed" | "timeout";

const PLAN_LABEL: Record<UserProfile["plan"], string> = {
  FREE: "Gratuito",
  STANDARD: "Standard",
  PRO: "Pro",
};

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [phase, setPhase] = useState<Phase>("checking");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const stopped = useRef(false);

  // Guard: sem session_id a página não foi alcançada via checkout do Stripe.
  // Redireciona para /plans para que ninguém acesse /success diretamente.
  useEffect(() => {
    if (!sessionId) {
      router.replace("/plans");
    }
  }, [sessionId, router]);

  useEffect(() => {
    if (!sessionId) return; // não inicia o polling sem checkout válido

    stopped.current = false;
    let attempts = 0;

    const tick = async () => {
      if (stopped.current) return;
      attempts += 1;
      try {
        const p = await getProfile();
        // Webhook já processou a fatura → assinatura ativa e plano pago.
        if (p.subscriptionStatus === "active" && p.plan !== "FREE") {
          setProfile(p);
          setPhase("confirmed");
          return;
        }
      } catch {
        /* ignora e tenta de novo */
      }
      if (attempts >= MAX_ATTEMPTS) {
        setPhase("timeout");
        return;
      }
      if (!stopped.current) setTimeout(tick, POLL_INTERVAL_MS);
    };

    tick();
    return () => {
      stopped.current = true;
    };
  }, [sessionId]);

  // Enquanto redireciona (sem session_id), não renderiza o conteúdo de sucesso.
  if (!sessionId) return null;

  return (
    <main className="bg-canvas min-h-screen flex items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        {phase === "checking" && (
          <>
            {/* Spinner */}
            <span className="inline-flex w-12 h-12 mb-6">
              <svg
                className="animate-spin text-ink"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeOpacity="0.15"
                  strokeWidth="2.5"
                />
                <path
                  d="M22 12a10 10 0 0 0-10-10"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <h1 className="display-lg text-ink mb-3">Confirmando pagamento…</h1>
            <p className="text-[16px] text-ink/60 leading-relaxed">
              Estamos liberando seus créditos. Isso pode levar alguns segundos —
              não feche esta página.
            </p>
          </>
        )}

        {phase === "confirmed" && profile && (
          <>
            <span className="inline-flex w-14 h-14 mb-6 items-center justify-center rounded-full bg-success/10">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5l4.5 4.5L19 7"
                  stroke="var(--color-success)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h1 className="display-lg text-ink mb-3">Pagamento confirmado!</h1>
            <p className="text-[16px] text-ink/60 leading-relaxed mb-2">
              Seu plano <strong className="text-ink">{PLAN_LABEL[profile.plan]}</strong>{" "}
              está ativo.
            </p>
            <p className="caption-mono text-ink/45 mb-9">
              {profile.credits} créditos disponíveis
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-6 py-3 rounded-[5px] transition-all duration-200"
            >
              Ir para o dashboard
            </Link>
          </>
        )}

        {phase === "timeout" && (
          <>
            <h1 className="display-lg text-ink mb-3">Quase lá…</h1>
            <p className="text-[16px] text-ink/60 leading-relaxed mb-9">
              Seu pagamento foi recebido, mas a confirmação está demorando mais
              que o normal. Seus créditos aparecem no dashboard assim que o
              Stripe finalizar — atualize a página em instantes.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-6 py-3 rounded-[5px] transition-all duration-200"
            >
              Ir para o dashboard
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessContent />
    </Suspense>
  );
}
