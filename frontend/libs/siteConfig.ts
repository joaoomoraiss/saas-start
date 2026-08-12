// Fonte única de verdade da marca: SEO, metadados, textos institucionais e
// e-mails de contato. Ao clonar o boilerplate, edite SÓ este arquivo (mais as
// envs) para trocar de produto — nenhum componente deve ter o nome cravado.
//
// O domínio vem 100% de NEXT_PUBLIC_DOMAIN_URL — basta trocar a env (ex.: na
// Vercel) para atualizar metadataBase, canonical, sitemap.xml e robots.txt.

const rawUrl = process.env.NEXT_PUBLIC_DOMAIN_URL ?? "http://localhost:3000";

// Remove barra final para evitar URLs com "//".
export const siteUrl = rawUrl.replace(/\/+$/, "");

export const siteConfig = {
  /** Nome curto do produto — usado no header, footer, e-mails e title. */
  name: "Acme",
  /** Razão social exibida no copyright e nos documentos legais. */
  legalName: "Acme Tecnologia Ltda.",
  url: siteUrl,
  title: "Acme — o subtítulo do seu SaaS aqui",
  description:
    "Descreva em uma frase o que o seu produto resolve. Este texto aparece no Google e nos previews de link.",
  locale: "pt_BR",
  twitter: "@acme",
  keywords: ["saas", "acme"],
  emails: {
    support: "suporte@acme.com",
    contact: "contato@acme.com",
    privacy: "privacidade@acme.com",
    press: "imprensa@acme.com",
  },
  /** Data da última revisão das páginas legais (exibida em /termos-de-uso etc.). */
  legalUpdatedAt: "01/01/2026",
} as const;

export type SiteConfig = typeof siteConfig;
