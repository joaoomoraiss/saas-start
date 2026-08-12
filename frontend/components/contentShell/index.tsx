import Header from "@/components/header";
import Footer from "@/components/footer";

interface ContentShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Data da última atualização (ex.: para páginas legais). */
  updatedAt?: string;
  children: React.ReactNode;
}

export default function ContentShell({
  eyebrow,
  title,
  subtitle,
  updatedAt,
  children,
}: ContentShellProps) {
  return (
    <main className="bg-canvas min-h-screen flex flex-col">
      <Header />

      {/* pt-14 compensa o header fixo (h-14) */}
      <article className="flex-1 pt-14">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <header className="mb-12">
            {eyebrow && <p className="eyebrow text-ink/45 mb-3">{eyebrow}</p>}
            <h1 className="display-lg text-ink">{title}</h1>
            {subtitle && (
              <p className="mt-4 text-[17px] leading-relaxed text-ink/60 max-w-2xl">
                {subtitle}
              </p>
            )}
            {updatedAt && (
              <p className="caption-mono text-ink/45 mt-6">
                Última atualização · {updatedAt}
              </p>
            )}
          </header>

          <div className="legal-prose space-y-5 text-[15px]">{children}</div>
        </div>
      </article>

      <Footer />
    </main>
  );
}
