import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";
import ContentShell from "@/components/contentShell";
import CookiePreferences from "@/components/cookiePreferences";

const description =
  `Política de Cookies do ${siteConfig.name}: o que são, como utilizamos e como você pode gerenciá-los.`;

export const metadata: Metadata = {
  title: "Política de Cookies",
  description,
  alternates: { canonical: "/politica-de-cookies" },
  openGraph: {
    title: `Política de Cookies · ${siteConfig.name}`,
    description,
    url: "/politica-de-cookies",
  },
};

export default function PoliticaDeCookiesPage() {
  return (
    <ContentShell
      eyebrow="Legal"
      title="Política de Cookies"
      updatedAt={siteConfig.legalUpdatedAt}
    >
      <p>
        Esta Política de Cookies explica o que são cookies, como o {siteConfig.name} os
        utiliza e como você pode gerenciá-los.
      </p>

      <h2>1. O que são cookies</h2>
      <p>
        Cookies são pequenos arquivos armazenados no seu dispositivo que ajudam o
        site a funcionar, lembrar preferências e entender como a plataforma é
        utilizada.
      </p>

      <h2>2. Tipos de cookies que usamos</h2>
      <ul>
        <li>
          <strong>Essenciais:</strong> necessários para autenticação e segurança
          (por exemplo, manter você conectado). Não podem ser desativados.
        </li>
        <li>
          <strong>Preferências:</strong> guardam configurações para melhorar sua
          experiência.
        </li>
        <li>
          <strong>Analíticos:</strong> ajudam a entender o uso da plataforma de
          forma agregada (Google Analytics). Só são ativados se você clicar em
          &quot;Aceitar&quot; no aviso de cookies.
        </li>
      </ul>
      <p>
        A verificação de segurança do cadastro (Cloudflare Turnstile) não grava
        cookies de rastreamento e funciona mesmo se você recusar os cookies
        analíticos.
      </p>

      <h2>3. Como gerenciar cookies</h2>
      <p>
        Você pode mudar sua escolha a qualquer momento. Ao revogar, apagamos os
        cookies analíticos já gravados e o aviso aparece de novo.
      </p>
      <p>
        <CookiePreferences />
      </p>
      <p>
        Você também pode bloquear ou apagar cookies nas configurações do
        navegador. Desativar cookies essenciais impede o login.
      </p>

      <h2>4. Cookies de terceiros</h2>
      <p>
        Alguns parceiros (como provedores de pagamento e análise) podem definir
        cookies próprios. O tratamento desses dados segue as políticas de cada
        provedor.
      </p>

      <h2>5. Mais informações</h2>
      <p>
        Para detalhes sobre como tratamos seus dados, consulte a nossa{" "}
        <a href="/politica-de-privacidade">Política de Privacidade</a> ou fale
        com a gente pela <a href="/contato">página de contato</a>.
      </p>
    </ContentShell>
  );
}
