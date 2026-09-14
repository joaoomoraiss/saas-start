import api from "@/libs/api";

// ─── Types ───────────────────────────────────────────────────────
// enum Plan do Prisma/backend.
export type Plan = "FREE" | "STANDARD" | "PRO";

// Planos que passam por cobranca no Stripe. O backend rejeita FREE
// no checkout com 400 ("Plan FREE does not require checkout").
export type PaidPlan = Exclude<Plan, "FREE">; // "STANDARD" | "PRO"

/** Direito de arrependimento (CDC Art. 49). O backend confere de novo. */
export const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// Payment — historico de cobrancas (uma linha por fatura paga na Stripe).
// ⚠️ amount vem em CENTAVOS (ex.: 1990 = R$ 19,90) — divida por 100 para exibir.
export interface Payment {
  id: string;
  /** null so em registros de contas ja excluidas (nunca aparece para o usuario). */
  userId: string | null;
  plan: Plan;
  amount: number; // em centavos
  currency: string; // ex.: "brl"
  status: "PAID" | "FAILED" | "REFUNDED";
  stripeInvoiceId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  hostedInvoiceUrl: string | null; // recibo (pagina Stripe)
  invoicePdfUrl: string | null; // PDF da fatura
  paidAt: string; // ISO date
  createdAt: string;
  updatedAt: string;
}

// ─── Checkout (POST /payments/checkout) ──────────────────────────
// Body: { plan }. Devolve a URL do Stripe Checkout — redirecione o navegador.
// 409 quando ja existe assinatura (ou um checkout anterior ainda processando).
// A liberacao do plano e ASSINCRONA (webhook): na /success faca polling em
// GET /user/profile.

export async function createCheckout(
  plan: PaidPlan
): Promise<{ url: string }> {
  const response = await api.post("/payments/checkout", { plan });
  return response.data;
}

// ─── Cancel (POST /payments/cancel) ──────────────────────────────
// Agenda o fim para o fim do periodo JA PAGO: o status vira "canceling" e o
// plano continua ate la. Os creditos acumulados permanecem.

export async function cancelSubscription(): Promise<{ message: string }> {
  const response = await api.post("/payments/cancel");
  return response.data;
}

// ─── Resume (POST /payments/resume) ──────────────────────────────
// Desfaz o cancelamento agendado, enquanto o periodo nao terminou.

export async function resumeSubscription(): Promise<{ message: string }> {
  const response = await api.post("/payments/resume");
  return response.data;
}

// ─── Refund (POST /payments/refund) ──────────────────────────────
// Reembolso integral da ultima cobranca, se feita ha ate 7 dias. Encerra o
// plano na hora e devolve os creditos daquela cobranca. 400 fora da janela.

export async function refundLastPayment(): Promise<Payment> {
  const response = await api.post("/payments/refund");
  return response.data;
}

// ─── Minhas cobrancas (GET /payments/user) ───────────────────────
// Devolve Payment[] do usuario logado, paidAt desc.

export async function fetchMyPayments(): Promise<Payment[]> {
  const response = await api.get("/payments/user");
  return response.data;
}
