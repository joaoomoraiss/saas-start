"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Logo from "@/public/Logo.png";
import { siteConfig } from "@/libs/siteConfig";
import { isLogged } from "@/libs/isLogged";
import { getProfile } from "@/services/user";

const NAV_LINKS = [
  { label: "Como funciona", href: "/#features" },
  { label: "Preços", href: "/plans" },
  { label: "Sobre", href: "/sobre" },
  { label: "Contato", href: "/contato" },
];

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  // null = ainda verificando; true/false = resultado da validação do cookie
  const [logged, setLogged] = useState<boolean | null>(null);
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Lê o cookie refreshToken e valida o JWT (server action)
  useEffect(() => {
    let active = true;
    isLogged()
      .then((ok) => active && setLogged(ok))
      .catch(() => active && setLogged(false));
    return () => {
      active = false;
    };
  }, []);

  // Carrega os créditos do usuário logado
  useEffect(() => {
    if (logged !== true) return;
    let active = true;
    getProfile()
      .then((p) => active && setCredits(p.credits))
      .catch(() => active && setCredits(null));
    return () => {
      active = false;
    };
  }, [logged]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 bg-canvas/90 backdrop-blur-md transition-all duration-300 ${
        scrolled ? "border-b border-hairline" : "border-b border-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0 group">
          <Image
            src={Logo}
            alt={siteConfig.name}
            priority
            className="w-7 h-7 object-contain"
          />
          <span className="text-[15px] font-semibold text-ink tracking-tight">
            {siteConfig.name}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-5">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="group relative inline-block text-[14px] text-ink/60 hover:text-ink py-1 transition-colors"
            >
              {item.label}
              <span className="pointer-events-none absolute left-0 -bottom-0 h-[1.5px] w-full bg-ink origin-right scale-x-0 transition-transform duration-300 ease-out group-hover:origin-left group-hover:scale-x-100" />
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-4 min-h-[36px]">
          {logged === true ? (
            <>
              {credits !== null && (
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 text-[13px] font-medium text-ink/75 border border-hairline rounded-pill px-3 py-1.5"
                  title={`${credits} créditos disponíveis`}
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7.5 1L2.5 8H6.5L6 13L11.5 6H7.5L7.5 1Z"
                      fill="var(--color-accent)"
                      stroke="var(--color-accent)"
                      strokeWidth="1"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {credits}
                </span>
              )}
              <Link
                href="/dashboard"
                className="group inline-flex items-center text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-5 py-2 rounded-[5px] hover:rounded-none transition-all duration-200"
              >
                Ir para o dashboard
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 12 12"
                  fill="none"
                  className="w-0 opacity-0 group-hover:w-[13px] group-hover:opacity-100 group-hover:ml-1.5 transition-all duration-200 overflow-hidden flex-shrink-0"
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
            </>
          ) : logged === false ? (
            <>
              <Link
                href="/login"
                className="group relative inline-block text-[14px] text-ink py-1 transition-colors"
              >
                Entrar
                <span className="pointer-events-none absolute left-0 -bottom-0 h-[1.5px] w-full bg-ink origin-right scale-x-0 transition-transform duration-300 ease-out group-hover:origin-left group-hover:scale-x-100" />
              </Link>
              <Link
                href="/register"
                className="group inline-flex items-center text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-5 py-2 rounded-[5px] hover:rounded-none transition-all duration-200"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 12 12"
                  fill="none"
                  className="w-0 opacity-0 group-hover:w-[13px] group-hover:opacity-100 group-hover:mr-1.5 transition-all duration-200 overflow-hidden flex-shrink-0"
                >
                  <path
                    d="M2 6H10M10 6L7 3M10 6L7 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Começar grátis
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
