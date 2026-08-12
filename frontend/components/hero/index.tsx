import Link from "next/link";

// Primeira dobra da landing page. Conteúdo em constantes no topo para trocar
// o texto sem mexer no layout.

const EYEBROW = "Novo produto";
const HEADLINE_LEAD = "O título que vende";
const HEADLINE_HIGHLIGHT = "o seu produto";
const SUBHEADLINE =
  "Uma ou duas frases explicando o problema que você resolve e para quem. Objetivo, sem jargão.";
const PRIMARY_CTA = { label: "Começar grátis", href: "/register" };
const SECONDARY_CTA = { label: "Ver planos", href: "/plans" };
const TRUST_NOTE = "Sem cartão de crédito · Cancele quando quiser";

const SWATCHES = [
  "var(--color-fig-red)",
  "var(--color-fig-orange)",
  "var(--color-fig-purple)",
  "var(--color-fig-blue)",
  "var(--color-fig-green)",
];

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center pt-14 pb-16 px-6 overflow-hidden bg-canvas"
    >
      {/* Dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, #e2e2e2 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      {/* Radial fade over dots */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 80% at 50% 50%, transparent 28%, #fff 80%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6 w-full max-w-[720px] mx-auto text-center">
        {/* Eyebrow + swatches */}
        <div
          className="flex items-center gap-3"
          style={{ animation: "fadeUp 0.5s 0.05s ease both" }}
        >
          <span className="eyebrow text-ink/55">{EYEBROW}</span>
          <span className="flex gap-1">
            {SWATCHES.map((c, i) => (
              <span
                key={c}
                className="w-2 h-2 rounded-[2px]"
                style={{
                  backgroundColor: c,
                  animation: "pulse 2.4s ease-in-out infinite",
                  animationDelay: `${i * 0.18}s`,
                }}
              />
            ))}
          </span>
        </div>

        <h1
          className="display-xl text-ink"
          style={{ animation: "fadeUp 0.5s 0.1s ease both" }}
        >
          {HEADLINE_LEAD}{" "}
          <span className="relative inline-block">
            {HEADLINE_HIGHLIGHT}
            <span
              aria-hidden
              className="absolute -bottom-1 left-0 right-0 h-[5px] rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, var(--color-fig-red), var(--color-fig-orange), var(--color-fig-purple), var(--color-fig-blue), var(--color-fig-green), var(--color-fig-red))",
                backgroundSize: "200% 100%",
                animation: "sweep 4s linear infinite",
              }}
            />
          </span>
        </h1>

        <p
          className="text-[18px] text-ink/60 leading-relaxed max-w-[560px]"
          style={{ animation: "fadeUp 0.5s 0.2s ease both" }}
        >
          {SUBHEADLINE}
        </p>

        <div
          className="flex flex-col sm:flex-row items-center gap-3 mt-2"
          style={{ animation: "fadeUp 0.5s 0.3s ease both" }}
        >
          <Link
            href={PRIMARY_CTA.href}
            className="group inline-flex items-center text-[15px] font-medium text-canvas bg-ink hover:opacity-90 px-6 py-3 rounded-[5px] hover:rounded-none transition-all duration-200"
          >
            {PRIMARY_CTA.label}
            <svg
              width="14"
              height="14"
              viewBox="0 0 12 12"
              fill="none"
              className="w-0 opacity-0 group-hover:w-[14px] group-hover:opacity-100 group-hover:ml-1.5 transition-all duration-200 overflow-hidden flex-shrink-0"
            >
              <path
                d="M2 6H10M10 6L7 3M10 6L7 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>

          <Link
            href={SECONDARY_CTA.href}
            className="inline-flex items-center text-[15px] font-medium text-ink border border-hairline hover:border-ink px-6 py-3 rounded-[5px] transition-all duration-200"
          >
            {SECONDARY_CTA.label}
          </Link>
        </div>

        <p className="caption-mono text-ink/40">{TRUST_NOTE}</p>
      </div>

      {/* Scroll hint */}
      <div className="absolute bottom-7 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 opacity-40 pointer-events-none animate-bounce">
        <span className="caption-mono text-ink/50">Explorar</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 2v10M7 12L3.5 8.5M7 12L10.5 8.5"
            stroke="currentColor"
            className="text-ink/50"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </section>
  );
}
