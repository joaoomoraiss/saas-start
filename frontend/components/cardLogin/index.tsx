"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import axios from "axios";
import Logo from "@/public/Logo.png";
import { siteConfig } from "@/libs/siteConfig";
import InputField from "../inputField";
import api from "@/libs/api";

interface FormState {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export default function CardLogin() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({ email: "", password: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  function handleChange(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!form.email.trim()) next.email = "E-mail obrigatório.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "E-mail inválido.";
    if (!form.password) next.password = "Senha obrigatória.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      await api.post("auth/login", {
        email: form.email,
        password: form.password,
      });

      router.push("/dashboard");
    } catch (err: unknown) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const message =
        status === 429
          ? "Muitas tentativas de login. Aguarde um minuto e tente de novo."
          : status === 503
            ? "Servidor indisponível. Tente novamente em instantes."
            : axios.isAxiosError(err) &&
                err.response?.data?.message === "Email not verified"
              ? "Confirme seu e-mail antes de entrar."
              : "E-mail ou senha inválidos. Tente novamente.";
      setErrors({ general: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[400px] bg-canvas border border-hairline rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.04)] px-8 py-10 flex flex-col gap-7">
      {/* Logo / wordmark */}
      <div className="flex flex-col items-center gap-2 text-center">
        <Image
          src={Logo}
          alt={siteConfig.name}
          priority
          className="w-10 h-10 object-contain mb-1"
        />
        <span className="eyebrow text-ink/40">Bem-vindo de volta</span>
        <h1 className="display-lg text-ink !text-[28px]">Entrar</h1>
        <p className="text-[14px] text-ink/50">
          Acesse sua conta para continuar
        </p>
      </div>

      {/* General error */}
      {errors.general && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-2.5 text-[13px] text-red-600">
          {errors.general}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <InputField
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          value={form.email}
          onChange={handleChange("email")}
          error={errors.email}
          autoComplete="email"
        />

        <div className="flex flex-col gap-1.5">
          <InputField
            label="Senha"
            showPasswordToggle
            placeholder="••••••••"
            value={form.password}
            onChange={handleChange("password")}
            error={errors.password}
            autoComplete="current-password"
          />
          {/* Forgot password */}
          <div className="flex justify-end">
            <a
              href="/forgot-password"
              className="text-[12px] text-accent hover:underline font-medium"
            >
              Esqueci a senha
            </a>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="mt-1 w-full flex items-center justify-center gap-2 text-[14px] font-medium text-canvas bg-ink hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed rounded-pill py-2.5 transition-opacity cursor-pointer border-none"
        >
          {loading ? (
            <>
              <svg
                className="animate-spin"
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
              >
                <path
                  d="M7 1.5a5.5 5.5 0 1 0 5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
              Entrando...
            </>
          ) : (
            "Entrar"
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-hairline" />
        <span className="caption-mono text-ink/35">ou</span>
        <div className="flex-1 h-px bg-hairline" />
      </div>

      {/* Register link */}
      <p className="text-center text-[13px] text-ink/55">
        Não tenho uma conta{" "}
        <a
          href="/register"
          className="text-accent font-medium hover:underline"
        >
          Criar conta
        </a>
      </p>
    </div>
  );
}
