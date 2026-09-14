"use client";

// components/pricing — Tabela de planos (cobrança mensal, Stripe).
// Reaproveitada na landing page e na página dedicada /plans.
// Contrato em .claude/skills/API_ROUTES.md §5 (Payments).
//
// Os ids FREE/STANDARD/PRO precisam bater com o enum Plan do backend — mude
// lá e aqui junto. Nome, preço, cota e features são livres.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { isLogged } from "@/libs/isLogged";
import { getProfile } from "@/services/user";
import { createCheckout, type Plan, type PaidPlan } from "@/services/payments";

interface PlanCard {
  id: Plan;
  name: string;
  price: number; // em reais, cobrança mensal
  credits: number;
  tagline: string;
  features: string[];
  cta: string;
  highlight?: boolean;
}

const PLANS: PlanCard[] = [
  {
    id: "FREE",
    name: "Gratuito",
    price: 0,
    credits: 0,
    tagline: "Para conhecer a plataforma.",
    features: [
      "Acesso a todos os recursos básicos",
      "1 usuário",
      "Suporte pela comunidade",
    ],
    cta: "Criar conta",
  },
  {
    id: "STANDARD",
    name: "Standard",
    price: 49,
    credits: 100, // = cota concedida pelo backend a cada fatura paga
    tagline: "Para quem usa o produto toda semana.",
    features: [
      "100 créditos por mês",
      "Até 5 usuários",
      "Histórico completo",
      "Suporte por e-mail",
    ],
    cta: "Assinar Standard",
    highlight: true,
  },
  {
    id: "PRO",
    name: "Pro",
    price: 149,
    credits: 500,
    tagline: "Para times e uso em alto volume.",
    features: [
      "500 créditos por mês",
      "Tudo do Standard",
      "Usuários ilimitados",
      "Suporte prioritário",
    ],
    cta: "Assinar Pro",
  },
];

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
  }).format(value);
}

export default function Pricing({ id = "pricing" }: { id?: string }) {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  // Plano atual do usuário logado (null = deslogado ou ainda carregando).
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);

  // Descobre o plano vigente para marcar "Plano atual" na grid.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!(await isLogged())) return;
        const profile = await getProfile();
        if (active) setCurrentPlan(profile.plan);
      } catch {
        /* deslogado / sem rede — segue como visitante */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const [error, setError] = useState<string | null>(null);

  const handleSelect = async (plan: Plan) => {
    if (loadingPlan) return;
    setLoadingPlan(plan);
    setError(null);
    try {
      const logged = await isLogged();
      // Sem login: manda criar conta antes de assinar.
      if (!logged) {
        router.push("/register");
        return;
      }
      // Plano gratuito: nada a cobrar, segue para o dashboard.
      if (plan === "FREE") {
        router.push("/dashboard");
        return;
      }
      // Planos pagos: abre o Stripe Checkout e redireciona o navegador.
      const { url } = await createCheckout(plan as PaidPlan);
      window.location.href = url;
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401) {
        router.push("/login");
      } else if (status === 409) {
        // Trocar de plano nao e checkout novo: a assinatura antiga ficaria
        // cobrando. O backend recusa; aqui so explicamos.
        setError(
          "Você já tem uma assinatura (ou um pagamento em processamento). Gerencie o plano em Configurações.",
        );
      } else if (status === 403) {
        setError("Confirme seu e-mail antes de assinar um plano.");
      } else {
        setError("Não foi possível iniciar o pagamento. Tente novamente em instantes.");
      }
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <section id={id} className="bg-canvas py-24 px-6">
      <div className="max-w-6xl mx-auto">
        {/* Cabeçalho */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="eyebrow text-ink/45 mb-4">Preços</p>
          <h2 className="display-lg text-ink mb-4">
            Planos simples, cobrança mensal.
          </h2>
          <p className="text-[18px] text-ink/60 leading-relaxed">
            Assine por mês e cancele quando quiser — sem fidelidade e sem
            surpresa na fatura.
          </p>
        </div>

        {error && (
          <div className="max-w-2xl mx-auto mb-8 bg-red-50 border border-red-200 rounded-md px-4 py-3 text-[14px] text-red-600 text-center">
            {error}
          </div>
        )}

        {/* Grid de planos */}
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => {
            const isLoading = loadingPlan === plan.id;
            const isCurrent = currentPlan === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-lg border p-8 transition-all ${
                  plan.highlight
                    ? "border-ink shadow-xl md:-translate-y-2"
                    : "border-hairline hover:border-ink/40"
                }`}
              >
                {plan.highlight && !isCurrent && (
                  <span className="absolute -top-3 left-8 caption-mono bg-accent text-canvas px-3 py-1 rounded-pill">
                    Mais popular
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 left-8 caption-mono bg-ink text-canvas px-3 py-1 rounded-pill">
                    Plano atual
                  </span>
                )}

                <h3 className="text-[20px] font-semibold text-ink tracking-tight">
                  {plan.name}
                </h3>
                <p className="text-[14px] text-ink/55 mt-1.5 leading-relaxed min-h-[42px]">
                  {plan.tagline}
                </p>

                {/* Preço */}
                <div className="mt-6 mb-1 flex items-end gap-1.5">
                  <span className="text-[44px] font-semibold text-ink tracking-tight leading-none">
                    {plan.price === 0 ? "Grátis" : formatBRL(plan.price)}
                  </span>
                  {plan.price > 0 && (
                    <span className="text-[15px] text-ink/50 mb-1.5">/mês</span>
                  )}
                </div>
                <p className="caption-mono text-ink/45 mb-7">
                  {plan.credits > 0
                    ? `${plan.credits} créditos / mês`
                    : "Sem créditos inclusos"}
                </p>

                {/* CTA */}
                <button
                  type="button"
                  onClick={() => handleSelect(plan.id)}
                  disabled={isLoading || isCurrent}
                  className={`w-full text-[14px] font-medium px-5 py-3 rounded-[5px] transition-all duration-200 cursor-pointer disabled:cursor-not-allowed ${
                    isCurrent
                      ? "border border-hairline text-ink/45 bg-surface-soft"
                      : plan.highlight
                        ? "bg-ink text-canvas hover:opacity-90 disabled:opacity-50"
                        : "border border-ink text-ink bg-transparent hover:bg-ink hover:text-canvas disabled:opacity-50"
                  }`}
                >
                  {isCurrent
                    ? "Plano atual"
                    : isLoading
                      ? "Redirecionando…"
                      : plan.cta}
                </button>

                {/* Features */}
                <ul className="mt-8 space-y-3">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2.5 text-[14px] text-ink/70"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="flex-shrink-0 mt-0.5"
                      >
                        <path
                          d="M3 8.5l3 3 7-8"
                          stroke="var(--color-success)"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <p className="caption-mono text-ink/40 text-center mt-12">
          Pagamento seguro via Stripe · Cancele a qualquer momento
        </p>
      </div>
    </section>
  );
}
