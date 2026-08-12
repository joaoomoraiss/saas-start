// Seção de features da landing page — troque o array FEATURES pelos
// diferenciais do seu produto. O layout se adapta a 2, 3 ou 6 itens.

interface Feature {
  title: string;
  description: string;
  color: string;
}

const FEATURES: Feature[] = [
  {
    title: "Primeiro diferencial",
    description:
      "Explique um benefício concreto em uma ou duas frases. Fale do resultado para o usuário, não da tecnologia.",
    color: "var(--color-fig-red)",
  },
  {
    title: "Segundo diferencial",
    description:
      "O que o seu produto faz que a alternativa manual não faz — tempo economizado, erro evitado, custo cortado.",
    color: "var(--color-fig-blue)",
  },
  {
    title: "Terceiro diferencial",
    description:
      "Encerre com a razão para confiar: segurança, suporte, integração com o que a pessoa já usa.",
    color: "var(--color-fig-green)",
  },
];

export default function Features({ id = "features" }: { id?: string }) {
  return (
    <section id={id} className="bg-canvas py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="max-w-2xl mb-14">
          <p className="eyebrow text-ink/45 mb-4">Como funciona</p>
          <h2 className="display-lg text-ink mb-4">
            Três motivos para começar hoje.
          </h2>
          <p className="text-[18px] text-ink/60 leading-relaxed">
            Substitua este texto pela proposta de valor do produto. Uma frase
            que amarra os três blocos abaixo.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((feature, i) => (
            <div
              key={feature.title}
              className="border border-hairline rounded-lg p-8 transition-all hover:border-ink/40"
            >
              <div className="flex items-center gap-2.5 mb-5">
                <span
                  className="w-6 h-6 rounded-[4px] flex items-center justify-center caption-mono text-canvas"
                  style={{ backgroundColor: feature.color }}
                >
                  {i + 1}
                </span>
              </div>
              <h3 className="text-[19px] font-semibold text-ink tracking-tight mb-2.5">
                {feature.title}
              </h3>
              <p className="text-[15px] text-ink/60 leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
