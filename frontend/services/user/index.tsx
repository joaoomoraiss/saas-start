import api from "@/libs/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus =
  | "active"
  | "past_due"
  /** Cancelamento agendado: o plano segue ativo ate o fim do periodo pago. */
  | "canceling"
  | "canceled";

export interface UserProfile {
  /** null enquanto o usuario nao preencheu o nome (o cadastro nao exige). */
  name: string | null;
  email: string;
  plan: "FREE" | "STANDARD" | "PRO";
  credits: number;
  /** null quando nunca houve assinatura. */
  subscriptionStatus: SubscriptionStatus | null;
  isVerified: boolean;
}

const isSuccess = (status: number) => status >= 200 && status < 300;

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile> {
  const response = await api.get("/user/profile");
  return response.data;
}

// ─── Update own profile (PATCH /user/profile) ─────────────────────────────────
// AuthGuard + VerifiedEmailGuard. O id vem do token — manda so { name }.

export async function updateProfileName(name: string): Promise<UserProfile> {
  const response = await api.patch("/user/profile", { name });
  return response.data;
}

// ─── Change own password (PATCH /user/password) ───────────────────────────────
// Exige a senha atual (401 se errada). Derruba as OUTRAS sessoes do usuario;
// a de quem trocou continua valendo.

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  const response = await api.patch("/user/password", {
    currentPassword,
    newPassword,
  });
  return response.data;
}

// ─── LGPD: exportar e excluir ─────────────────────────────────────────────────

/**
 * GET /user/me/export devolve um JSON como anexo. Use como href de um link:
 * o browser baixa o arquivo com os cookies da sessao.
 */
export const EXPORT_DATA_URL = "/api/user/me/export";

/** DELETE /user/me — exige a senha. Cancela a assinatura antes de apagar. */
export async function deleteMyAccount(password: string): Promise<void> {
  await api.delete("/user/me", { data: { password } });
}

// ─── Email Verification (POST /auth/verify-email) ─────────────────────────────
// Reenvia o e-mail de confirmacao. Responde 202 exista a conta ou nao.

export async function sendEmailVerification(email: string): Promise<boolean> {
  const response = await api.post("/auth/verify-email", { email });
  return isSuccess(response.status);
}

// ─── Register ────────────────────────────────────────────────────

export async function register(data: {
  name: string;
  email: string;
  password: string;
  /** Token do Cloudflare Turnstile, quando o captcha esta configurado. */
  captchaToken?: string;
}) {
  const response = await api.post("/auth/register", data);
  return response.data;
}

// ─── Login ───────────────────────────────────────────────────────
// A rota /api/auth/login do Next grava a sessao em cookies httpOnly; nenhum
// token volta para o JavaScript.

export async function login(data: {
  email: string;
  password: string;
}): Promise<{ ok: true }> {
  const response = await api.post("/auth/login", data);
  return response.data;
}

// ─── Confirm Email ───────────────────────────────────────────────

export async function confirmEmail(token: string) {
  const response = await api.post("/auth/confirm", { token });
  return response.data;
}

// ─── Forgot Password ─────────────────────────────────────────────

export async function forgotPassword(email: string) {
  const response = await api.post("/auth/forgot-password", { email });
  return response.data;
}

// ─── Reset Password ──────────────────────────────────────────────
// O link e de uso unico e derruba todas as sessoes abertas.

export async function resetPassword(token: string, newPassword: string) {
  const response = await api.post("/auth/reset-password", {
    token,
    newPassword,
  });

  return response.data;
}

// ─── Sign Out ─────────────────────────────────────────────────────
// Revoga a sessao no backend e apaga os cookies.

export async function signOut() {
  await api.post("/auth/logout");
}
