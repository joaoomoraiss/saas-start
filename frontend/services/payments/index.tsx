import api from "@/libs/api";

// ─── Types ───────────────────────────────────────────────────────
// enum Plan do Prisma/backend (ver API_ROUTES.md §5).
export type Plan = "FREE" | "STANDARD" | "PRO";

// Planos que passam por cobrança no Stripe. O backend rejeita FREE
// no checkout com 400 ("Plan FREE does not require checkout").
export type PaidPlan = Exclude<Plan, "FREE">; // "STANDARD" | "PRO"

// Payment — histórico de cobranças (uma linha por fatura paga na Stripe).
// ⚠️ amount vem em CENTAVOS (ex.: 1990 = R$ 19,90) — divida por 100 para exibir.
export interface Payment {
  id: string;
  userId: string;
  plan: Plan;
  amount: number; // em centavos
  currency: string; // ex.: "brl"
  status: "PAID" | "FAILED" | "REFUNDED";
  stripeInvoiceId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  hostedInvoiceUrl: string | null; // 🧾 recibo (página Stripe)
  invoicePdfUrl: string | null; // 🧾 PDF da fatura
  paidAt: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

// ─── Checkout (POST /payments/checkout) ──────────────────────────
// AuthGuard. Body: { plan: "STANDARD" | "PRO" }. Devolve a URL do
// Stripe Checkout — redirecione o navegador para ela. Pós-pagamento o
// Stripe volta para ${APP_DOMAIN}/success?session_id=... (sucesso) ou
// ${APP_DOMAIN}/plans (cancelado). A liberação de plano/créditos é
// ASSÍNCRONA (via webhook) — na /success faça polling em GET /user/profile.

export async function createCheckout(
  plan: PaidPlan
): Promise<{ url: string }> {
  const response = await api.post("/payments/checkout", { plan });
  return response.data;
}

// ─── Cancel (POST /payments/cancel) ──────────────────────────────
// AuthGuard. Cancela a assinatura ativa, volta o usuário para FREE
// (os créditos já acumulados permanecem).

export async function cancelSubscription(): Promise<{ message: string }> {
  const response = await api.post("/payments/cancel");
  return response.data;
}

// ─── Minhas cobranças (GET /payments/user) ───────────────────────
// AuthGuard + MailGuard. Devolve Payment[] do usuário logado, paidAt desc.
// Use para a tela de "Histórico de pagamentos / Faturas".

export async function fetchMyPayments(): Promise<Payment[]> {
  const response = await api.get("/payments/user");
  return response.data;
}
