import { jwtVerify } from "jose";

/** Roles emitidas pelo backend (enum Role do Prisma — sempre MAIÚSCULAS). */
export type Role = "USER" | "ADMIN";

export interface Session {
  id: string;
  role: Role;
}

/**
 * Valida a assinatura do cookie `refreshToken` e devolve a sessão contida nele.
 * Retorna null quando o token é ausente, inválido ou expirado — os callers
 * tratam null como "não autenticado".
 *
 * ⚠️ Usa JWT_REFRESH_SECRET, não JWT_SECRET. O backend assina cada tipo de
 * token com um secret próprio (src/auth/token.service.ts) e o boot dele recusa
 * secrets repetidos — validar com o secret errado reprova todo mundo.
 *
 * Só use no servidor: o secret não pode ser exposto ao browser.
 */
export async function verifyJwtToken(
  token: string | null,
): Promise<Session | null> {
  try {
    const jwtSecret = process.env.JWT_REFRESH_SECRET;

    if (!jwtSecret) {
      console.error("JWT_REFRESH_SECRET is not defined");
      return null;
    }

    if (!token) {
      return null;
    }

    const secret = new TextEncoder().encode(jwtSecret);
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
    });

    // O backend carimba o propósito do token em `typ`. Conferir aqui fecha a
    // porta para um token de outro tipo que porventura use o mesmo secret.
    if (payload.typ !== "refresh") {
      return null;
    }

    // Um token válido sem `role` continua sendo uma sessão válida: assume o
    // menor privilégio em vez de tratar como não autenticado.
    const role = payload.role === "ADMIN" ? "ADMIN" : "USER";

    return { id: String(payload.id ?? payload.sub ?? ""), role };
  } catch {
    // Token inválido/expirado é fluxo normal — não polui o log com stack trace.
    return null;
  }
}
