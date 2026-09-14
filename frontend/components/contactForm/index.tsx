"use client";

// Formulario de contato. Vai para /api/contact (BFF), que repassa ao backend
// com o SERVICE_TOKEN; o backend envia pela Resend para CONTACT_EMAIL.

import { useState } from "react";
import axios from "axios";
import InputField from "@/components/inputField";
import { siteConfig } from "@/libs/siteConfig";
import { sendContactMessage } from "@/services/contact";

interface FormState {
  name: string;
  email: string;
  message: string;
}

type FormErrors = Partial<Record<keyof FormState, string>>;

const EMPTY: FormState = { name: "", email: "", message: "" };

export default function ContactForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [general, setGeneral] = useState<string | null>(null);

  function field(key: keyof FormState) {
    return (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };
  }

  function validate(): boolean {
    const next: FormErrors = {};
    if (form.name.trim().length < 2) next.name = "Informe seu nome.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      next.email = "E-mail inválido.";
    if (form.message.trim().length < 10)
      next.message = "Escreva pelo menos 10 caracteres.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSending(true);
    setGeneral(null);

    try {
      await sendContactMessage({
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      });
      setSent(true);
      setForm(EMPTY);
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // Distinguir "nao enviamos" de "enviamos" importa: senao a pessoa espera
      // uma resposta que nunca vem.
      setGeneral(
        status === 429
          ? "Você enviou várias mensagens em pouco tempo. Tente de novo mais tarde."
          : status === 400
            ? "Confira os campos e tente de novo."
            : `Não conseguimos enviar agora. Escreva direto para ${siteConfig.emails.contact}.`,
      );
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="not-prose bg-surface-soft border border-hairline rounded-md px-5 py-4 text-[14px] text-ink">
        Mensagem enviada. Respondemos no e-mail que você informou.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="not-prose flex flex-col gap-4 max-w-xl"
    >
      {general && (
        <div className="bg-red-50 border border-red-200 rounded-md px-4 py-2.5 text-[13px] text-red-600">
          {general}
        </div>
      )}

      <InputField
        label="Nome"
        type="text"
        placeholder="Seu nome"
        value={form.name}
        onChange={(e) => field("name")(e.target.value)}
        error={errors.name}
        autoComplete="name"
      />

      <InputField
        label="E-mail"
        type="email"
        placeholder="seu@email.com"
        value={form.email}
        onChange={(e) => field("email")(e.target.value)}
        error={errors.email}
        autoComplete="email"
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="contact-message" className="text-[13px] font-medium text-ink/70">
          Mensagem
        </label>
        <textarea
          id="contact-message"
          rows={5}
          value={form.message}
          onChange={(e) => field("message")(e.target.value)}
          placeholder="Como podemos ajudar?"
          maxLength={5000}
          className={`w-full bg-canvas border rounded-md px-4 py-3 text-[15px] text-ink placeholder-ink/35 outline-none transition-all focus:border-ink ${
            errors.message ? "border-red-400" : "border-hairline"
          }`}
        />
        {errors.message && (
          <p className="text-[12px] text-red-500">{errors.message}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={sending}
        className="w-fit text-[14px] font-medium text-canvas bg-ink hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-2.5 rounded-pill transition-opacity cursor-pointer border-none"
      >
        {sending ? "Enviando…" : "Enviar mensagem"}
      </button>
    </form>
  );
}
