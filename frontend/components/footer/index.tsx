import Link from "next/link";
import Image from "next/image";
import Logo from "@/public/Logo.png";
import { siteConfig } from "@/libs/siteConfig";

const FOOTER_LINKS: Record<string, { label: string; href: string }[]> = {
  Produto: [
    { label: "Como funciona", href: "/#features" },
    { label: "Preços", href: "/plans" },
  ],
  Empresa: [
    { label: "Sobre", href: "/sobre" },
    { label: "Contato", href: "/contato" },
  ],
  Legal: [
    { label: "Privacidade", href: "/politica-de-privacidade" },
    { label: "Cookies", href: "/politica-de-cookies" },
    { label: "Termos", href: "/termos-de-uso" },
  ],
};

const FILM = [
  "var(--color-fig-red)",
  "var(--color-fig-orange)",
  "var(--color-fig-purple)",
  "var(--color-fig-blue)",
  "var(--color-fig-green)",
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-canvas">
      {/* Filmstrip divider */}
      <div className="flex h-1">
        {FILM.map((c, i) => (
          <span key={i} className="flex-1" style={{ backgroundColor: c }} />
        ))}
      </div>

      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="inline-flex items-center gap-2.5 mb-4">
              <Image
                src={Logo}
                alt={siteConfig.name}
                className="w-7 h-7 object-contain"
              />
              <span className="text-[22px] font-semibold text-ink tracking-tight">
                {siteConfig.name}
              </span>
            </Link>
            <p className="text-[15px] text-ink/55 leading-relaxed max-w-[260px]">
              {siteConfig.description}
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="caption-mono text-ink/45 mb-4">{group}</p>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[14px] text-ink/65 hover:text-ink transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-6 border-t border-hairline flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="caption-mono text-ink/45">
            © {year} {siteConfig.legalName}
          </p>
          <a
            href={`mailto:${siteConfig.emails.support}`}
            className="caption-mono text-ink/45 hover:text-ink transition-colors"
          >
            {siteConfig.emails.support}
          </a>
        </div>
      </div>
    </footer>
  );
}
