"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import api from "@/libs/api";
import InputField from "../inputField";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{8,24}$/;

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
  barColor: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", color: "", barColor: "" };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.match(/[a-z]/)) score++;
  if (password.match(/[A-Z]/)) score++;
  if (password.match(/[0-9]/)) score++;
  if (password.match(/[!@#$%^&*]/)) score++;

  if (score <= 2) return { score, label: "Fraca", color: "text-red-500", barColor: "bg-red-400" };
  if (score === 3) return { score, label: "Média", color: "text-amber-500", barColor: "bg-amber-400" };
  if (score === 4) return { score, label: "Forte", color: "text-accent", barColor: "bg-accent" };
  return { score, label: "Muito forte", color: "text-success", barColor: "bg-success" };
}

interface Requirement {
  label: string;
  met: boolean;
}

function getRequirements(password: string): Requirement[] {
  return [
    { label: "Pelo menos 8 caracteres", met: password.length >= 8 },
    { label: "Uma letra minúscula", met: !!password.match(/[a-z]/) },
    { label: "Uma letra maiúscula", met: !!password.match(/[A-Z]/) },
    { label: "Um número", met: !!password.match(/[0-9]/) },
  ];
}

export default function NewPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const errRef = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validPassword, setValidPassword] = useState(false);
  const [passwordMatch, setPasswordMatch] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Validate token presence
  useEffect(() => {
    if (!token) setErrMsg("Token de redefinição inválido ou expirado.");
  }, [token]);

  useEffect(() => {
    setValidPassword(PASSWORD_REGEX.test(password));
  }, [password]);

  useEffect(() => {
    setPasswordMatch(password === confirmPassword && confirmPassword !== "");
  }, [password, confirmPassword]);

  const strength = getPasswordStrength(password);
  const requirements = getRequirements(password);

  const handleSubmit = async () => {
    setSubmitted(true);

    if (!password || !validPassword) {
      setErrMsg("A senha deve ter 8–24 caracteres com pelo menos 1 minúscula, 1 maiúscula e 1 número.");
      return;
    }
    if (!passwordMatch) {
      setErrMsg("As senhas não coincidem.");
      return;
    }
    if (!token) {
      setErrMsg("Token de redefinição inválido.");
      return;
    }

    setIsLoading(true);
    setErrMsg("");

    try {
      await api.post("auth/reset-password", { token, newPassword: password });

      setSuccessMsg("Sua senha foi redefinida com sucesso!");
      setPassword("");
      setConfirmPassword("");
      setSubmitted(false);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // O link e de uso unico: reaproveitar um link ja usado cai no 401.
      setErrMsg(
        status === 401 || status === 404
          ? "Link inválido, expirado ou já usado. Solicite uma nova redefinição."
          : status === 400
            ? "A senha não atende aos critérios de segurança."
            : status === 429
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
        {/* Header */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="w-12 h-12 rounded-md bg-surface-soft border border-hairline flex items-center justify-center mb-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-ink/70" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <span className="eyebrow text-ink/40">Nova senha</span>
          <h1 className="display-lg text-ink !text-[26px]">
            Criar nova senha
          </h1>
          <p className="text-[14px] text-ink/50 max-w-[300px] leading-relaxed">
            Certifique-se de criar uma senha forte e segura.
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

        {/* Form fields */}
        <div className="flex flex-col gap-5">
          {/* New password */}
          <div className="flex flex-col gap-2">
            <InputField
              label="Nova senha"
              showPasswordToggle
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrMsg("");
              }}
              error={
                submitted && password && !validPassword
                  ? "Mínimo 8 caracteres, 1 maiúscula, 1 minúscula e 1 número."
                  : undefined
              }
              autoComplete="new-password"
            />

            {/* Strength bar */}
            {password && (
              <div className="flex items-center gap-3 mt-1">
                <div className="flex-1 h-1.5 bg-surface-soft rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${strength.barColor}`}
                    style={{ width: `${(strength.score / 5) * 100}%` }}
                  />
                </div>
                <span className={`text-[12px] font-medium flex-shrink-0 ${strength.color}`}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div className="flex flex-col gap-1.5">
            <InputField
              label="Confirmar nova senha"
              showPasswordToggle
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrMsg("");
              }}
              error={
                submitted && confirmPassword && !passwordMatch
                  ? "As senhas não coincidem."
                  : undefined
              }
              autoComplete="new-password"
            />
            {confirmPassword && passwordMatch && (
              <p className="flex items-center gap-1.5 text-[12px] text-success">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                As senhas coincidem
              </p>
            )}
          </div>

          {/* Requirements checklist */}
          <div className="bg-surface-soft border border-hairline rounded-md px-4 py-4 flex flex-col gap-2">
            <p className="caption-mono text-ink/45 mb-1">Requisitos da senha</p>
            {requirements.map((req) => (
              <div key={req.label} className="flex items-center gap-2.5">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${
                    req.met ? "bg-ink" : "bg-hairline"
                  }`}
                >
                  {req.met && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path d="M1.5 4L3 5.5L6.5 2.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={`text-[13px] transition-colors duration-200 ${req.met ? "text-ink" : "text-ink/40"}`}>
                  {req.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading || !password || !confirmPassword || !validPassword || !passwordMatch}
          className="w-full flex items-center justify-center gap-2 text-[14px] font-medium text-canvas bg-ink hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-pill py-3 transition-opacity cursor-pointer border-none"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1.5a5.5 5.5 0 1 0 5.5 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              Definindo senha…
            </>
          ) : (
            "Definir nova senha"
          )}
        </button>

        {/* Footer link */}
        <p className="text-center text-[13px] text-ink/55">
          <Link href="/login" className="text-accent font-medium hover:underline">
            Voltar para o login
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