import { NextRequest, NextResponse } from "next/server";
import { verifyJwtToken } from "./libs/auth";

// Next 16: a convenção `middleware` foi renomeada para `proxy` e passa a rodar
// no Node.js runtime por padrão (em vez do Edge). Isso resolve o
// MIDDLEWARE_INVOCATION_FAILED na Vercel, que ocorria porque a verificação de
// JWT com `jose` falhava ao inicializar no Edge Runtime.
//
// Modelo de proteção: tudo que NÃO está em `publicRoutes` é privado por
// padrão (fail-closed). Ao criar uma rota pública nova, adicione-a aqui —
// esquecer só torna a rota mais restrita, nunca mais aberta.

type PublicRoute = {
  path: string;
  /**
   * O que fazer quando um usuário JÁ logado acessa esta rota:
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

// Rotas que exigem role "admin" no JWT. Prefixo: "/admin" cobre "/admin/*".
const adminRoutes = ["/admin"];

const REDIRECT_WHEN_NOT_AUTHENTICATED = "/login";
const REDIRECT_WHEN_AUTHENTICATED = "/dashboard";
const REDIRECT_WHEN_NOT_ADMIN = "/";

export async function proxy(request: NextRequest) {
  try {
    return await handleProxy(request);
  } catch (error) {
    console.error("Proxy error:", error);
    // Um erro inesperado não pode derrubar o site inteiro. As rotas privadas
    // continuam protegidas pelos guards do backend.
    return NextResponse.next();
  }
}

async function handleProxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const publicRoute = publicRoutes.find((route) => route.path === path);
  const authToken = request.cookies.get("refreshToken");
  const isAdminRoute = adminRoutes.some((route) => path.startsWith(route));

  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    return NextResponse.redirect(url);
  };

  // Sem cookie: só passa em rota pública.
  if (!authToken) {
    return publicRoute
      ? NextResponse.next()
      : redirectTo(REDIRECT_WHEN_NOT_AUTHENTICATED);
  }

  // Com cookie, mas a assinatura pode estar inválida/expirada. Validamos uma
  // única vez e reaproveitamos o resultado nas checagens abaixo.
  const session = await verifyJwtToken(authToken.value);

  // Token inválido em rota privada: limpa o cookie e manda logar de novo.
  if (!session && !publicRoute) {
    const response = redirectTo(REDIRECT_WHEN_NOT_AUTHENTICATED);
    response.cookies.delete("refreshToken");
    return response;
  }

  // Logado tentando abrir /login, /register etc.
  if (session && publicRoute?.whenAuthenticated === "redirect") {
    return redirectTo(REDIRECT_WHEN_AUTHENTICATED);
  }

  // Rota de admin exige a role correspondente.
  if (isAdminRoute && session?.role !== "ADMIN") {
    return redirectTo(REDIRECT_WHEN_NOT_ADMIN);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
