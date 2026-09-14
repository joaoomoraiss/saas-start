"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";


import axios from "axios";
import InputField from "../inputField";
import api from "@/libs/api";

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export default function ForgotPassword() {
  const router = useRouter();

  const errRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [validEmail, setValidEmail] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setValidEmail(EMAIL_REGEX.test(email));
  }, [email]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);

    if (!email || !validEmail) {
      setErrMsg("Por favor, insira um endereço de e-mail válido.");
      return;
    }

    setIsLoading(true);
    setErrMsg("");

    try {
      await api.post("auth/forgot-password", { email });

      // O backend responde igual exista a conta ou nao: a tela tambem, para
      // nao revelar quem tem cadastro.
      setSuccessMsg(
        "Se houver uma conta com este e-mail, enviamos as instruções para redefinir a senha.",
      );
      setEmail("");
      setSubmitted(false);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err) {
      setErrMsg(
        axios.isAxiosError(err) && err.response?.status === 429
          ? "Muitas tentativas. Tente novamente mais tarde."
          : "Servidor não está respondendo. Tente novamente.",
      );
      errRef.current?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-4 relative overflow-hidden">
      {/* Dot grid background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "radial-gradient(circle, #e2e2e2 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 70% 80% at 50% 50%, transparent 30%, #fff 80%)",
        }}
      />

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-[420px] bg-canvas border border-hairline rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.04)] px-8 py-10 flex flex-col gap-7"
        style={{ animation: "fadeUp 0.45s ease both" }}
      >
        {/* Back link */}
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-[13px] text-ink/45 hover:text-ink transition-colors w-fit"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M9 2.5L4.5 7L9 11.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Voltar para o login
        </Link>

        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-md bg-surface-soft border border-hairline flex items-center justify-center mb-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-ink/70" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <span className="eyebrow text-ink/40">Recuperar acesso</span>
          <h1 className="display-lg text-ink !text-[26px]">
            Esqueceu sua senha?
          </h1>
          <p className="text-[14px] text-ink/50 max-w-[300px] leading-relaxed">
            Digite seu e-mail e enviaremos as instruções para redefinir sua senha.
          </p>
        </div>

        {/* Error message */}
        {errMsg && (
          <div
            ref={errRef}
            aria-live="assertive"
            className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-[13px] text-red-600"
          >
            {errMsg}
          </div>
        )}

        {/* Success message */}
        {successMsg && (
          <div
            aria-live="assertive"
            className="bg-surface-soft border border-hairline rounded-md px-4 py-3 flex items-start gap-3"
          >
            <div className="w-5 h-5 rounded-full bg-ink flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5L4 7L8 3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <p className="text-[13px] text-ink font-medium">{successMsg}</p>
              <p className="text-[12px] text-ink/50 mt-0.5">Redirecionando para o login…</p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <InputField
              label="E-mail"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrMsg("");
              }}
              error={submitted && email && !validEmail ? "Formato de e-mail inválido." : undefined}
              autoComplete="email"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !email}
            className="mt-1 w-full flex items-center justify-center gap-2 text-[14px] font-medium text-canvas bg-ink hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-pill py-3 transition-opacity cursor-pointer border-none"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1.5a5.5 5.5 0 1 0 5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Enviando…
              </>
            ) : (
              "Enviar instruções"
            )}
          </button>
        </form>

        {/* Footer link */}
        <p className="text-center text-[13px] text-ink/55">
          Lembrou da senha?{" "}
          <Link href="/login" className="text-accent font-medium hover:underline">
            Fazer login
          </Link>
        </p>
      </div>

      <style jsx>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </main>
  );
}