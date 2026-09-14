"use client";

// Widget do Cloudflare Turnstile (captcha).
//
// Turnstile e nao reCAPTCHA: nao grava cookie de rastreamento, entao funciona
// para quem recusou cookies no banner (LGPD). A validacao de verdade acontece
// no backend — o widget so obtem o token.
//
// Sem NEXT_PUBLIC_TURNSTILE_SITE_KEY o componente nao renderiza nada e o
// cadastro segue sem captcha (o backend tambem aceita sem
// TURNSTILE_SECRET_KEY). Conveniente em dev, inaceitavel em producao.

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** true quando o captcha esta ligado e o formulario deve exigir o token. */
export const captchaEnabled = Boolean(SITE_KEY);

interface TurnstileApi {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      language?: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileProps {
  /** Tela protegida. Precisa bater com a action conferida no backend. */
  action: string;
  /** Recebe o token (ou null quando expira/falha). Passe uma funcao estavel. */
  onToken: (token: string | null) => void;
  /**
   * Mude o valor para gerar um desafio novo. Tokens sao de USO UNICO: depois
   * de um envio recusado (senha fraca, e-mail repetido), o antigo nao serve.
   */
  resetSignal?: number;
}

export default function Turnstile({
  action,
  onToken,
  resetSignal = 0,
}: TurnstileProps) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    if (!SITE_KEY || !scriptReady || !container.current || !window.turnstile) {
      return;
    }

    const id = window.turnstile.render(container.current, {
      sitekey: SITE_KEY,
      action,
      language: "pt-br",
      callback: (token) => onToken(token),
      "expired-callback": () => onToken(null),
      "error-callback": () => onToken(null),
    });
    widgetId.current = id;

    return () => {
      window.turnstile?.remove(id);
      widgetId.current = null;
    };
  }, [scriptReady, action, onToken]);

  useEffect(() => {
    if (resetSignal && widgetId.current && window.turnstile) {
      window.turnstile.reset(widgetId.current);
    }
  }, [resetSignal]);

  if (!SITE_KEY) return null;

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
      />
      <div ref={container} className="min-h-[65px]" />
    </>
  );
}
