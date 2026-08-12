import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";
import ContentShell from "@/components/contentShell";

const description =
  `Política de Privacidade do ${siteConfig.name}: como coletamos, usamos e protegemos seus dados pessoais.`;

export const metadata: Metadata = {
  title: "Política de Privacidade",
  description,
  alternates: { canonical: "/politica-de-privacidade" },
  openGraph: {
    title: `Política de Privacidade · ${siteConfig.name}`,
    description,
    url: "/politica-de-privacidade",
  },
};

export default function PoliticaDePrivacidadePage() {
  return (
    <ContentShell
      eyebrow="Legal"
      title="Política de Privacidade"
      updatedAt={siteConfig.legalUpdatedAt}
    >
      <p>
        Esta Política de Privacidade explica como o {siteConfig.name} coleta, utiliza e
        protege seus dados pessoais, em conformidade com a Lei Geral de Proteção
        de Dados (LGPD).
      </p>

      <h2>1. Dados que coletamos</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail e credenciais de acesso.
        </li>
        <li>
          <strong>Uso:</strong> conteúdos enviados e histórico de atividade na
          plataforma.
        </li>
        <li>
          <strong>Pagamento:</strong> dados necessários para processar
          assinaturas (processados por parceiros de pagamento).
        </li>
        <li>
          <strong>Técnicos:</strong> endereço IP, tipo de dispositivo e dados de
          navegação.
        </li>
      </ul>

      <h2>2. Como usamos os dados</h2>
      <p>
        Utilizamos seus dados para operar e melhorar a plataforma, processar
        pagamentos, oferecer suporte, garantir segurança e cumprir obrigações
        legais.
      </p>

      <h2>3. Compartilhamento</h2>
      <p>
        Não vendemos seus dados. Podemos compartilhá-los com prestadores de
        serviço essenciais (como hospedagem e pagamentos) e quando exigido por
        lei.
      </p>

      <h2>4. Cookies</h2>
      <p>
        Utilizamos cookies para autenticação e melhoria da experiência. Saiba
        mais na nossa{" "}
        <a href="/politica-de-cookies">Política de Cookies</a>.
      </p>

      <h2>5. Seus direitos</h2>
      <p>
        Você pode solicitar acesso, correção, portabilidade ou exclusão dos seus
        dados, além de revogar consentimentos, a qualquer momento.
      </p>

      <h2>6. Segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger seus dados
        contra acesso não autorizado, perda ou alteração.
      </p>

      <h2>7. Contato do encarregado</h2>
      <p>
        Para exercer seus direitos ou tirar dúvidas sobre privacidade, escreva
        para{" "}
        <a href={`mailto:${siteConfig.emails.privacy}`}>{siteConfig.emails.privacy}</a>{" "}
        ou use a <a href="/contato">página de contato</a>.
      </p>
    </ContentShell>
  );
}
