import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";
import Header from "@/components/header";
import Footer from "@/components/footer";
import Pricing from "@/components/pricing";

const description =
  `Planos do ${siteConfig.name} com cobrança mensal: Gratuito, Standard e Pro. Escolha o que precisa e cancele quando quiser.`;

export const metadata: Metadata = {
  title: "Planos",
  description,
  alternates: {
    canonical: "/plans",
  },
  openGraph: {
    title: `Planos · ${siteConfig.name}`,
    description,
    url: "/plans",
  },
};

// Esta também é a rota de retorno do Stripe quando o checkout é cancelado
// (${APP_DOMAIN}/plans — ver API_ROUTES.md §5).
export default function PlansPage() {
  return (
    <main className="bg-canvas min-h-screen">
      <Header />
      {/* pt-14 compensa o header fixo (h-14) */}
      <div className="pt-14">
        <Pricing id="plans" />
      </div>
      <Footer />
    </main>
  );
}
