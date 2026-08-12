import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";
import ContentShell from "@/components/contentShell";

const description = `Conheça o ${siteConfig.name}: quem somos, o que fazemos e por que construímos este produto.`;

export const metadata: Metadata = {
  title: "Sobre",
  description,
  alternates: { canonical: "/sobre" },
  openGraph: {
    title: `Sobre · ${siteConfig.name}`,
    description,
    url: "/sobre",
  },
};

export default function SobrePage() {
  return (
    <ContentShell
      eyebrow="A empresa"
      title={`Sobre o ${siteConfig.name}`}
      subtitle="Uma frase que resume por que a empresa existe e para quem ela trabalha."
    >
      <h2>Nossa missão</h2>
      <p>
        Descreva aqui o problema que motivou a criação do produto e a mudança
        que vocês querem provocar no dia a dia de quem usa. Dois ou três
        parágrafos costumam bastar.
      </p>

      <h2>O que fazemos</h2>
      <p>
        Explique de forma concreta o que a plataforma entrega — sem jargão e sem
        prometer o que ainda não existe.
      </p>
      <ul>
        <li>Primeiro recurso ou benefício principal.</li>
        <li>Segundo recurso ou benefício principal.</li>
        <li>Planos flexíveis, do gratuito ao profissional.</li>
      </ul>

      <h2>Nossos valores</h2>
      <p>
        Liste os princípios que guiam as decisões do time — e que o cliente
        consegue perceber no produto.
      </p>

      <h2>Fale com a gente</h2>
      <p>
        Quer saber mais ou tem uma ideia? Visite a nossa{" "}
        <a href="/contato">página de contato</a>.
      </p>
    </ContentShell>
  );
}
