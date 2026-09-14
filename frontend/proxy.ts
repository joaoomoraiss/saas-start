import { NextRequest, NextResponse } from "next/server";
import { applySession, resolveSession } from "./libs/server/auth-context";
import { clientIpFrom } from "./libs/server/backend";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./libs/server/session";

// Next 16: a convencao `middleware` foi renomeada para `proxy` e roda no
// Node.js runtime por padrao.
//
// Modelo de protecao: tudo que NAO esta em `publicRoutes` e privado por
// padrao (fail-closed). Ao criar uma rota publica nova, adicione-a aqui —
// esquecer so torna a rota mais restrita, nunca mais aberta.
//
// O proxy e so a primeira camada (decide a navegacao). Os dados vem das rotas
// /api, e quem autoriza de verdade sao os guards do backend.

type PublicRoute = {
  path: string;
  /**
   * O que fazer quando um usuario JA logado acessa esta rota:
   * "redirect" manda para o dashboard (ex.: /login), "next" deixa passar.
   */
  whenAuthenticated: "redirect" | "next";
};

const publicRoutes: readonly PublicRoute[] = [
  { path: "/login", whenAuthenticated: "redirect" },
  { path: "/register", whenAuthenticated: "redirect" },
  { path: "/forgot-password", whenAuthenticated: "redirect" },
  { path: "/reset-password", whenAuthenticated: "redirect" },
  // "next" e nao "redirect": o caso comum e o usuario ja estar logado e sem
  // e-mail confirmado. Redirecionar aqui inutilizaria o link do e-mail.
  { path: "/confirm", whenAuthenticated: "next" },
  { path: "/", whenAuthenticated: "next" },
  { path: "/plans", whenAuthenticated: "next" },
  { path: "/sobre", whenAuthenticated: "next" },
  { path: "/contato", whenAuthenticated: "next" },
  { path: "/politica-de-cookies", whenAuthenticated: "next" },
  { path: "/politica-de-privacidade", whenAuthenticated: "next" },
  { path: "/termos-de-uso", whenAuthenticated: "next" },
];

// Rotas que exigem role ADMIN. Prefixo: "/admin" cobre "/admin/*".
const adminRoutes = ["/admin"];

const REDIRECT_WHEN_NOT_AUTHENTICATED = "/login";
const REDIRECT_WHEN_AUTHENTICATED = "/dashboard";
const REDIRECT_WHEN_NOT_ADMIN = "/";

export async function proxy(request: NextRequest) {
  try {
    return await handleProxy(request);
  } catch (error) {
    console.error("Proxy error:", error);
    // Um erro inesperado nao pode derrubar o site inteiro. Os dados continuam
    // protegidos pelos guards do backend.
    return NextResponse.next();
  }
}

async function handleProxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoute = publicRoutes.find((route) => route.path === path);
  const isAdminRoute = adminRoutes.some((route) => path.startsWith(route));

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    return NextResponse.redirect(url);
  };

  const hasSessionCookie =
    request.cookies.has(ACCESS_COOKIE) || request.cookies.has(REFRESH_COOKIE);

  // Sem cookie: so passa em rota publica.
  if (!hasSessionCookie) {
    return publicRoute
      ? NextResponse.next()
      : redirectTo(REDIRECT_WHEN_NOT_AUTHENTICATED);
  }

  // Access token valido, ou renovado agora pelo refresh. O par renovado vai
  // na resposta (applySession), antes de a pagina chamar qualquer /api.
  const resolved = await resolveSession(
    request.cookies,
    clientIpFrom(request.headers),
  );
  const { session } = resolved;

  let response: NextResponse;

  if (!session) {
    response = publicRoute
      ? NextResponse.next()
      : redirectTo(REDIRECT_WHEN_NOT_AUTHENTICATED);
  } else if (publicRoute?.whenAuthenticated === "redirect") {
    response = redirectTo(REDIRECT_WHEN_AUTHENTICATED);
  } else if (isAdminRoute && session.role !== "ADMIN") {
    response = redirectTo(REDIRECT_WHEN_NOT_ADMIN);
  } else {
    response = NextResponse.next();
  }

  return applySession(response, resolved);
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto:
     * - api (rotas /api resolvem a sessao por conta propria)
     * - _next/static, _next/image (arquivos estaticos)
     * - favicon.ico, sitemap.xml, robots.txt (metadados)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
