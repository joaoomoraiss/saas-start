import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";
import ContentShell from "@/components/contentShell";
import ContactForm from "@/components/contactForm";

const description =
  `Fale com a equipe do ${siteConfig.name}. Tire dúvidas sobre planos, suporte, parcerias ou imprensa.`;

export const metadata: Metadata = {
  title: "Contato",
  description,
  alternates: { canonical: "/contato" },
  openGraph: {
    title: `Contato · ${siteConfig.name}`,
    description,
    url: "/contato",
  },
};

export default function ContatoPage() {
  return (
    <ContentShell
      eyebrow="Fale com a gente"
      title="Contato"
      subtitle="Estamos por aqui para ajudar com dúvidas, suporte, parcerias ou imprensa."
    >
      <h2>Envie uma mensagem</h2>
      <ContactForm />

      <h2>Suporte</h2>
      <p>
        Precisa de ajuda com sua conta, créditos ou assinatura? Escreva
        para{" "}
        <a href={`mailto:${siteConfig.emails.support}`}>{siteConfig.emails.support}</a> e
        respondemos o mais rápido possível.
      </p>

      <h2>Comercial e parcerias</h2>
      <p>
        Interessado em planos corporativos ou parcerias? Fale com{" "}
        <a href={`mailto:${siteConfig.emails.contact}`}>{siteConfig.emails.contact}</a>.
      </p>

      <h2>Imprensa</h2>
      <p>
        Para solicitações de imprensa e materiais de marca, escreva para{" "}
        <a href={`mailto:${siteConfig.emails.press}`}>{siteConfig.emails.press}</a>.
      </p>

      <h2>Redes sociais</h2>
      <p>
        Acompanhe novidades e bastidores do {siteConfig.name} nas nossas redes —
        compartilhamos lançamentos, exemplos e dicas regularmente.
      </p>
    </ContentShell>
  );
}
