import { NextResponse, type NextRequest } from "next/server";
import { applySession, resolveSession } from "@/libs/server/auth-context";
import {
  BACKEND_URL,
  clientIpFrom,
  serviceHeaders,
} from "@/libs/server/backend";

/**
 * BFF generico: /api/<rota> repassa para <BACKEND_URL>/<rota>.
 *
 * O browser so fala com o Next. Esta camada:
 * - le o access token do cookie httpOnly e manda como Authorization;
 * - renova a sessao quando o access token expirou (e grava o par novo);
 * - identifica o Next perante a API (SERVICE_TOKEN + IP real do visitante).
 *
 * Autorizacao continua 100% no backend: aqui nao ha regra de quem pode o que.
 */

/**
 * Rotas que nao passam por aqui. Login/logout/refresh tem handlers proprios
 * (precisam mexer nos cookies); o webhook da Stripe fala direto com a API.
 */
const BLOCKED = [/^auth\/(login|logout|refresh-token)$/, /^payments\/webhook$/];

/** Cabecalhos da resposta do backend que interessam ao browser. */
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "retry-after",
];

async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const route = path.join("/");

  if (BLOCKED.some((pattern) => pattern.test(route))) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  const clientIp = clientIpFrom(request.headers);
  const resolved = await resolveSession(request.cookies, clientIp);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const contentType = request.headers.get("content-type");

  let upstream: Response;

  try {
    upstream = await fetch(
      `${BACKEND_URL}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
      {
        method: request.method,
        headers: {
          ...(contentType ? { "Content-Type": contentType } : {}),
          ...(resolved.accessToken
            ? { Authorization: `Bearer ${resolved.accessToken}` }
            : {}),
          ...serviceHeaders(clientIp),
        },
        body: hasBody ? await request.arrayBuffer() : undefined,
        cache: "no-store",
        redirect: "manual",
      },
    );
  } catch {
    return applySession(
      NextResponse.json(
        { message: "Servidor indisponível. Tente novamente." },
        { status: 503 },
      ),
      resolved,
    );
  }

  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }

  const response = new NextResponse(
    upstream.status === 204 ? null : upstream.body,
    { status: upstream.status, headers },
  );

  // Sinaliza ao client (libs/api.ts) que a sessao acabou, para mandar ao
  // login. So quando o backend recusou a sessao — um 401 de "senha atual
  // incorreta" nao pode deslogar ninguem.
  if (resolved.expired) {
    response.headers.set("x-session-expired", "1");
  }

  return applySession(response, resolved);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
