import api from "@/libs/api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  /** null enquanto o usuario nao preencheu o nome (o cadastro nao exige). */
  name: string | null;
  email: string;
  plan: "FREE" | "STANDARD" | "PRO";
  credits: number;
  // "active" | "past_due" | "canceled" | null (sem assinatura)
  subscriptionStatus: "active" | "past_due" | "canceled" | null;
  isVerified: boolean;
}

// POST /auth/login devolve apenas { token }.
// `token` é o accessToken — mande no header Authorization.
// O refreshToken NÃO vem no corpo: ele é gravado como cookie httpOnly, para
// que JavaScript nenhum consiga lê-lo. Quem o usa é o proxy.ts (server-side).
export interface AuthResponse {
  token: string;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export async function getProfile(): Promise<UserProfile> {
  const response = await api.get("/user/profile");
  return response.data;
}

// ─── Update own profile (PATCH /user/profile) ─────────────────────────────────
// AuthGuard + MailGuard. O id vem do token — manda só { name }. Devolve o
// profile enxuto atualizado (mesmo shape do GET /user/profile).

export async function updateProfileName(name: string): Promise<UserProfile> {
  const response = await api.patch("/user/profile", { name });
  return response.data;
}

// ─── Change own password (PATCH /user/password) ───────────────────────────────
// AuthGuard + MailGuard. Exige a senha atual (bcrypt.compare). 401 se a senha
// atual estiver incorreta ("Current password is incorrect").

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

// ─── Email Verification (POST /auth/verify-email) ─────────────────────────────
// Reenvia o email de confirmação. Response 200 com corpo vazio.

export async function sendEmailVerification(email: string): Promise<boolean> {
  const response = await api.post("/auth/verify-email", { email });
  return response.status === 200 || response.status === 201;
}

// ─── Register ────────────────────────────────────────────────────

export async function register(data: {
  name: string;
  email: string;
  password: string;
}) {
  const response = await api.post("/auth/register", data);
  return response.data;
}

// ─── Login ───────────────────────────────────────────────────────

export async function login(data: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const response = await api.post("/auth/login", data, {
    withCredentials: true, // 🔥 importante para cookie
  });

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

export async function resetPassword(
  token: string,
  newPassword: string
) {
  const response = await api.post("/auth/reset-password", {
    token,
    newPassword,
  });

  return response.data;
}

// ─── Refresh Token ───────────────────────────────────────────────

export async function refreshToken() {
  const response = await api.post("/auth/refresh-token", {}, {
    withCredentials: true,
  });

  return response.data;
}

// ─── Sign Out ─────────────────────────────────────────────────────

export async function signOut() {
  await api.post("/auth/logout", {}, { withCredentials: true });
}