"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import axios from "axios";
import Logo from "@/public/Logo.png";
import { siteConfig } from "@/libs/siteConfig";
import InputField from "@/components/inputField";
import api from "@/libs/api";

interface FormState {
  name: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  acceptedTerms?: string;
  general?: string;
}

export default function CardRegister() {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    password: "",
    acceptedTerms: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  function handleChange(field: keyof Omit<FormState, "acceptedTerms">) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
      if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
    };
  }

  function toggleTerms() {
    setForm((prev) => ({ ...prev, acceptedTerms: !prev.acceptedTerms }));
    if (errors.acceptedTerms)
      setErrors((prev) => ({ ...prev, acceptedTerms: undefined }));
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (!form.name.trim()) next.name = "Nome obrigatório.";
    else if (form.name.trim().length < 2) next.name = "Nome muito curto.";
    if (!form.email.trim()) next.email = "E-mail obrigatório.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "E-mail inválido.";
    if (!form.password) next.password = "Senha obrigatória.";
    else if (form.password.length < 8)
      next.password = "A senha deve ter pelo menos 8 caracteres.";
    if (!form.acceptedTerms)
      next.acceptedTerms = "Você precisa aceitar os termos para continuar.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setErrors({});

    try {
      await api.post("auth/register/", {
        name: form.name,
        email: form.email,
        password: form.password,
      });

      router.push("/login");
    } catch (err: unknown) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : "Não foi possível criar a conta. Tente novamente.";
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
        <span className="eyebrow text-ink/40">Comece grátis</span>
        <h1 className="display-lg text-ink !text-[28px]">Criar conta</h1>
        <p className="text-[14px] text-ink/50">
          Leva menos de um minuto
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
          label="Nome"
          type="text"
          placeholder="Seu nome completo"
          value={form.name}
          onChange={handleChange("name")}
          error={errors.name}
          autoComplete="name"
        />

        <InputField
          label="E-mail"
          type="email"
          placeholder="seu@email.com"
          value={form.email}
          onChange={handleChange("email")}
          error={errors.email}
          autoComplete="email"
        />

        <InputField
          label="Senha"
          showPasswordToggle
          placeholder="Mínimo 8 caracteres"
          value={form.password}
          onChange={handleChange("password")}
          error={errors.password}
          autoComplete="new-password"
        />

        {/* Terms toggle */}
        <div className="flex flex-col gap-1.5">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            {/* Custom checkbox */}
            <button
              type="button"
              role="checkbox"
              aria-checked={form.acceptedTerms}
              onClick={toggleTerms}
              className={[
                "mt-0.5 w-4 h-4 flex-shrink-0 rounded-sm border transition-all duration-150 cursor-pointer flex items-center justify-center",
                form.acceptedTerms
                  ? "bg-ink border-ink"
                  : "bg-canvas border-hairline hover:border-ink",
                errors.acceptedTerms ? "border-red-400" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {form.acceptedTerms && (
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <path
                    d="M1.5 4.5L3.5 6.5L7.5 2.5"
                    stroke="white"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <span className="text-[13px] text-ink/55 leading-snug">
              Aceito os{" "}
              <a
                href="/terms"
                className="text-accent font-medium hover:underline"
              >
                termos de uso
              </a>{" "}
              e a{" "}
              <a
                href="/privacy"
                className="text-accent font-medium hover:underline"
              >
                política de privacidade
              </a>
            </span>
          </label>
          {errors.acceptedTerms && (
            <p className="text-[12px] text-red-500 ml-7">
              {errors.acceptedTerms}
            </p>
          )}
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
              Criando conta...
            </>
          ) : (
            "Criar conta"
          )}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-hairline" />
        <span className="caption-mono text-ink/35">ou</span>
        <div className="flex-1 h-px bg-hairline" />
      </div>

      {/* Login link */}
      <p className="text-center text-[13px] text-ink/55">
        Já tenho uma conta{" "}
        <a href="/login" className="text-accent font-medium hover:underline">
          Entrar
        </a>
      </p>
    </div>
  );
}
