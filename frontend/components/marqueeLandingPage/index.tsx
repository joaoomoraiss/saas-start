// Faixa rolante logo abaixo do hero — bom lugar para provas sociais curtas.
const ITEMS = [
  "Comece em 2 minutos",
  "Sem cartão de crédito",
  "Cancele quando quiser",
  "Suporte em português",
  "Dados no Brasil",
  "Pagamento seguro via Stripe",
];

const SWATCHES = [
  "var(--color-fig-red)",
  "var(--color-fig-orange)",
  "var(--color-fig-purple)",
  "var(--color-fig-blue)",
  "var(--color-fig-green)",
];

export default function Marquee() {
  return (
    <div className="bg-canvas border-y border-hairline py-6 overflow-hidden select-none">
      <div className="flex w-max animate-marquee">
        {/* Render twice for a seamless loop */}
        {[0, 1].map((copy) => (
          <div key={copy} className="flex" aria-hidden={copy === 1}>
            {ITEMS.map((item, i) => (
              <span
                key={`${copy}-${i}`}
                className="flex items-center gap-3 px-7 text-[14px] text-ink/65 whitespace-nowrap font-mono tracking-tight"
              >
                <span
                  className="w-2 h-2 rounded-[2px] flex-shrink-0"
                  style={{ backgroundColor: SWATCHES[i % SWATCHES.length] }}
                />
                {item}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
