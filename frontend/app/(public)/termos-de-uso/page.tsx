import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";
import ContentShell from "@/components/contentShell";

const description =
  `Termos de Uso do ${siteConfig.name}: as regras para utilização da plataforma.`;

export const metadata: Metadata = {
  title: "Termos de Uso",
  description,
  alternates: { canonical: "/termos-de-uso" },
  openGraph: {
    title: `Termos de Uso · ${siteConfig.name}`,
    description,
    url: "/termos-de-uso",
  },
};

export default function TermosDeUsoPage() {
  return (
    <ContentShell
      eyebrow="Legal"
      title="Termos de Uso"
      updatedAt={siteConfig.legalUpdatedAt}
    >
      <p>
        Estes Termos de Uso regem o acesso e a utilização da plataforma
        {siteConfig.name}. Ao criar uma conta ou utilizar nossos serviços, você concorda
        com as condições descritas abaixo.
      </p>

      <h2>1. Aceitação dos termos</h2>
      <p>
        Ao acessar ou usar o {siteConfig.name}, você declara ter lido, compreendido e
        aceitado estes Termos, bem como a nossa{" "}
        <a href="/politica-de-privacidade">Política de Privacidade</a>. Caso não
        concorde, não utilize a plataforma.
      </p>

      <h2>2. Uso da conta</h2>
      <p>
        Você é responsável por manter a confidencialidade das suas credenciais e
        por todas as atividades realizadas na sua conta. Notifique-nos
        imediatamente em caso de uso não autorizado.
      </p>

      <h2>3. Créditos e pagamentos</h2>
      <p>
        Alguns recursos exigem créditos ou assinatura. Cobranças, renovações e
        cancelamentos seguem o plano contratado. Os valores e condições estão
        disponíveis na <a href="/plans">página de planos</a>.
      </p>

      <h2>4. Conteúdo do usuário</h2>
      <p>
        Você é responsável pelo conteúdo que envia e pelo uso que faz dos
        resultados. É proibido publicar material ilegal, que viole direitos de
        terceiros ou as nossas políticas de uso aceitável.
      </p>

      <h2>5. Propriedade intelectual</h2>
      <p>
        A plataforma, sua marca e tecnologia pertencem ao {siteConfig.name}. O uso dos
        serviços não transfere a você nenhum direito sobre a propriedade
        intelectual da empresa, exceto a licença de uso dos resultados gerados,
        conforme o seu plano.
      </p>

      <h2>6. Limitação de responsabilidade</h2>
      <p>
        O {siteConfig.name} é fornecido &quot;como está&quot;. Não nos responsabilizamos
        por danos indiretos decorrentes do uso ou da impossibilidade de uso da
        plataforma, na máxima extensão permitida pela legislação aplicável.
      </p>

      <h2>7. Alterações</h2>
      <p>
        Podemos atualizar estes Termos periodicamente. Mudanças relevantes serão
        comunicadas, e o uso continuado após a atualização representa a aceitação
        dos novos termos.
      </p>

      <h2>8. Contato</h2>
      <p>
        Dúvidas sobre estes Termos podem ser enviadas pela{" "}
        <a href="/contato">página de contato</a>.
      </p>
    </ContentShell>
  );
}
