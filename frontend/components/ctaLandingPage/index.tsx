import Link from "next/link";

// Bloco de fechamento da landing page. Manda direto para o cadastro em vez de
// capturar e-mail: o registro já é o funil real do boilerplate.

const HEADLINE = "Comece a usar agora mesmo.";
const SUBHEADLINE =
  "Crie sua conta em menos de um minuto e explore o plano gratuito antes de assinar.";

const FEATURES = [
  "Setup em minutos",
  "Sem cartão de crédito",
  "Cancele quando quiser",
  "Suporte por e-mail",
];

// Equalizer decorativo com a paleta Figma
const BARS = [
  "var(--color-fig-red)",
  "var(--color-fig-orange)",
  "var(--color-fig-purple)",
  "var(--color-fig-blue)",
  "var(--color-fig-green)",
  "var(--color-fig-blue)",
  "var(--color-fig-purple)",
  "var(--color-fig-orange)",
  "var(--color-fig-red)",
];

export default function CTA() {
  return (
    <section
      id="cta"
      className="relative bg-block-navy py-24 px-6 text-center overflow-hidden"
    >
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-center gap-1.5 h-10 mb-8">
          {BARS.map((c, i) => (
            <span
              key={i}
              className="w-1.5 rounded-full origin-bottom"
              style={{
                height: "100%",
                backgroundColor: c,
                animation: "bars 1.1s ease-in-out infinite",
                animationDelay: `${i * 0.09}s`,
              }}
            />
          ))}
        </div>

        <div className="max-w-xl mx-auto">
          <p className="eyebrow text-inverse-ink/55 mb-4">
            Grátis para começar
          </p>
          <h2 className="display-lg text-inverse-ink mb-4">{HEADLINE}</h2>
          <p className="text-[18px] text-inverse-ink/65 leading-relaxed mb-9">
            {SUBHEADLINE}
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
            <Link
              href="/register"
              className="bg-accent hover:bg-accent-pressed text-canvas text-[15px] font-medium px-7 py-3 rounded-pill transition-colors whitespace-nowrap"
            >
              Criar conta grátis →
            </Link>
            <Link
              href="/plans"
              className="text-inverse-ink/80 hover:text-inverse-ink text-[15px] font-medium px-7 py-3 rounded-pill border border-white/20 hover:border-white/50 transition-colors whitespace-nowrap"
            >
              Comparar planos
            </Link>
          </div>

          <p className="caption-mono text-inverse-ink/45 mb-9">
            Sem cartão de crédito · Cancele quando quiser
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {FEATURES.map((f) => (
              <span
                key={f}
                className="text-[13px] text-inverse-ink/75 border border-white/20 rounded-pill px-3.5 py-1.5"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
