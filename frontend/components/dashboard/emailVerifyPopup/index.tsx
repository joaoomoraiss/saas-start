"use client";

// Popup de verificação de e-mail. Dois fluxos:
//  • autoSend (botão da sidebar): dispara o e-mail ao abrir e confirma o envio.
//  • padrão (ação bloqueada por e-mail não confirmado): pede a verificação e só
//    envia quando o usuário clica no botão.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { sendEmailVerification } from "@/services/user";

type Status = "idle" | "sending" | "sent" | "error";

interface EmailVerifyPopupProps {
  email: string | null;
  /** Envia o e-mail automaticamente ao abrir (fluxo do botão da sidebar). */
  autoSend?: boolean;
  onClose: () => void;
}

export default function EmailVerifyPopup({
  email,
  autoSend = false,
  onClose,
}: EmailVerifyPopupProps) {
  const [status, setStatus] = useState<Status>(autoSend ? "sending" : "idle");
  const didAutoSend = useRef(false);

  // createPortal precisa do document: só renderiza depois da hidratação.
  // useSyncExternalStore evita o setState-dentro-de-effect do padrão `mounted`.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const send = useCallback(async () => {
    if (!email) return;
    setStatus("sending");
    try {
      const ok = await sendEmailVerification(email);
      setStatus(ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }, [email]);

  // Auto-envio ao abrir (apenas uma vez). O status já nasce "sending" quando
  // autoSend está ligado, então nada de setState síncrono aqui.
  useEffect(() => {
    if (!autoSend || didAutoSend.current) return;
    didAutoSend.current = true;

    let active = true;
    (async () => {
      if (!email) {
        if (active) setStatus("error");
        return;
      }
      try {
        const ok = await sendEmailVerification(email);
        if (active) setStatus(ok ? "sent" : "error");
      } catch {
        if (active) setStatus("error");
      }
    })();

    return () => {
      active = false;
    };
  }, [autoSend, email]);

  // Fecha com Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!mounted) return null;

  const sent = status === "sent";
  const sending = status === "sending";
  const error = status === "error";

  const title = sent
    ? "E-mail de verificação enviado"
    : error
      ? "Não foi possível enviar"
      : autoSend
        ? "Enviando verificação…"
        : "Verifique seu e-mail";

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ animation: "fadeUp 0.2s ease both" }}
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Verificação de e-mail"
    >
      <div className="absolute inset-0 bg-ink/60" />

      <div
        className="relative z-10 w-full max-w-[400px] bg-canvas border border-hairline rounded-lg shadow-2xl p-8 flex flex-col items-center text-center gap-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Ícone */}
        <div className="w-14 h-14 rounded-full bg-surface-soft flex items-center justify-center">
          {sent ? (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 12.5L9.5 18L20 6.5"
                stroke="var(--color-accent)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 7l9 6 9-6M3 6.5h18v11H3z"
                stroke="var(--color-accent)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>

        {/* Textos */}
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[18px] font-semibold text-ink tracking-tight">
            {title}
          </h3>
          <p className="text-[14px] text-ink/55 leading-relaxed">
            {sent ? (
              <>
                Enviamos um link de confirmação para{" "}
                <span className="font-medium text-ink">{email}</span>. Verifique
                sua caixa de entrada (e o spam).
              </>
            ) : error ? (
              "Algo deu errado ao enviar o e-mail. Tente novamente em instantes."
            ) : autoSend ? (
              <>
                Enviando um link de confirmação para{" "}
                <span className="font-medium text-ink">{email}</span>…
              </>
            ) : (
              <>
                Você precisa confirmar seu e-mail para liberar todos os
                recursos. Podemos enviar um novo link de confirmação para{" "}
                <span className="font-medium text-ink">{email}</span>.
              </>
            )}
          </p>
        </div>

        {/* Ações */}
        {sent ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-1 w-full text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-5 py-2.5 rounded-pill transition-opacity cursor-pointer border-none"
          >
            Entendi
          </button>
        ) : error ? (
          <div className="mt-1 flex gap-2 w-full">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-[14px] font-medium text-ink/60 hover:text-ink px-5 py-2.5 rounded-pill border border-hairline hover:border-ink transition-colors cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={send}
              className="flex-1 text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-5 py-2.5 rounded-pill transition-opacity cursor-pointer border-none"
            >
              Tentar novamente
            </button>
          </div>
        ) : autoSend ? (
          <button
            type="button"
            disabled
            className="mt-1 w-full flex items-center justify-center gap-2 text-[14px] font-medium text-canvas bg-ink opacity-60 px-5 py-2.5 rounded-pill border-none cursor-default"
          >
            <Spinner />
            Enviando…
          </button>
        ) : (
          <div className="mt-1 flex flex-col gap-2 w-full">
            <button
              type="button"
              onClick={send}
              disabled={sending || !email}
              className="w-full flex items-center justify-center gap-2 text-[14px] font-medium text-canvas bg-ink hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 rounded-pill transition-opacity cursor-pointer border-none"
            >
              {sending && <Spinner />}
              {sending ? "Enviando…" : "Enviar e-mail de verificação"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-[13px] font-medium text-ink/50 hover:text-ink py-1.5 transition-colors cursor-pointer"
            >
              Agora não
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="13"
      height="13"
      viewBox="0 0 12 12"
      fill="none"
    >
      <path
        d="M6 1a5 5 0 1 0 5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
