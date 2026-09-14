"use client";

// Google Analytics, carregado SO depois do consentimento.
//
// O script nem e montado com consentimento negado ou pendente — nao basta o
// Consent Mode em "denied": o gtag.js carregado ainda faz requisicoes ao
// Google, e isso ja e tratamento de dado sem base legal.
//
// Sem NEXT_PUBLIC_GA_ID, nada e carregado e o site funciona normalmente.

import Script from "next/script";
import { useConsent } from "@/libs/consent";

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function Analytics() {
  const consent = useConsent();

  if (!GA_ID || consent !== "granted") return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}', { anonymize_ip: true });`}
      </Script>
    </>
  );
}
