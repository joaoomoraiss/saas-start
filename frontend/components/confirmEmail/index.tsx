"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { confirmEmail } from "@/services/user";

type Status = "confirming" | "confirmed" | "invalid" | "error";

export default function ConfirmEmail() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<Status>(token ? "confirming" : "invalid");
  // O React roda os efeitos duas vezes em dev (StrictMode); sem a trava, o
  // token seria consumido duas vezes e a segunda chamada falharia.
  const alreadySent = useRef(false);

  useEffect(() => {
    if (!token || alreadySent.current) return;
    alreadySent.current = true;

    let active = true;
    (async () => {
      try {
        await confirmEmail(token);
        if (active) setStatus("confirmed");
      } catch {
        // Token expirado, já usado ou adulterado — o backend não distingue.
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-6 py-24">
      <div className="w-full max-w-md text-center">
        {status === "confirming" && (
          <>
            <span className="inline-flex w-12 h-12 mb-6">
              <svg
                className="animate-spin text-ink"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeOpacity="0.15"
                  strokeWidth="2.5"
                />
                <path
                  d="M22 12a10 10 0 0 0-10-10"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <h1 className="display-lg text-ink mb-3">Confirmando seu e-mail…</h1>
            <p className="text-[16px] text-ink/60 leading-relaxed">
              Só um instante.
            </p>
          </>
        )}

        {status === "confirmed" && (
          <>
            <span className="inline-flex w-14 h-14 mb-6 items-center justify-center rounded-full bg-success/10">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path
                  d="M5 12.5l4.5 4.5L19 7"
                  stroke="var(--color-success)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h1 className="display-lg text-ink mb-3">E-mail confirmado!</h1>
            <p className="text-[16px] text-ink/60 leading-relaxed mb-9">
              Sua conta está liberada. Faça login para continuar.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-6 py-3 rounded-[5px] transition-all duration-200"
            >
              Entrar
            </Link>
          </>
        )}

        {(status === "invalid" || status === "error") && (
          <>
            <h1 className="display-lg text-ink mb-3">
              {status === "invalid" ? "Link incompleto" : "Link inválido"}
            </h1>
            <p className="text-[16px] text-ink/60 leading-relaxed mb-9">
              {status === "invalid"
                ? "Este endereço não tem um token de confirmação. Abra o link direto do e-mail que enviamos."
                : "Este link expirou ou já foi usado. Entre na sua conta e peça um novo e-mail de confirmação."}
            </p>
            <Link
              href="/login"
              className="inline-flex items-center text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-6 py-3 rounded-[5px] transition-all duration-200"
            >
              Ir para o login
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
