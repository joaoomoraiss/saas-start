import { jwtVerify } from "jose";

/** Roles emitidas pelo backend (enum Role do Prisma — sempre MAIÚSCULAS). */
export type Role = "USER" | "ADMIN";

export interface Session {
  id: string;
  role: Role;
}

/**
 * Valida a assinatura do JWT e devolve a sessão contida nele.
 * Retorna null quando o token é ausente, inválido ou expirado — os callers
 * tratam null como "não autenticado".
 *
 * Só use no servidor: depende de JWT_SECRET, que não é exposto ao browser.
 */
export async function verifyJwtToken(
  token: string | null,
): Promise<Session | null> {
  try {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      console.error("JWT_SECRET is not defined");
      return null;
    }

    if (!token) {
      return null;
    }

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret);

    // Um token válido sem `role` continua sendo uma sessão válida: assume o
    // menor privilégio em vez de tratar como não autenticado.
    const role = payload.role === "ADMIN" ? "ADMIN" : "USER";

    return { id: String(payload.id ?? payload.sub ?? ""), role };
  } catch {
    // Token inválido/expirado é fluxo normal — não polui o log com stack trace.
    return null;
  }
}
