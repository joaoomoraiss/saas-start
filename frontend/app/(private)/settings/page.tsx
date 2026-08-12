"use client";

// app/(private)/settings/page.tsx

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import axios from "axios";
import {
  getProfile,
  updateProfileName,
  changePassword,
  type UserProfile,
} from "@/services/user";
import {
  cancelSubscription,
  fetchMyPayments,
  type Payment,
} from "@/services/payments";

// ─── Types ────────────────────────────────────────────────────────────────────

type SettingsSection = "general" | "language" | "payments";

interface PasswordForm {
  current: string;
  next: string;
  confirm: string;
}

interface ProfileErrors {
  name?: string;
  general?: string;
}

interface PasswordErrors {
  current?: string;
  next?: string;
  confirm?: string;
  general?: string;
}

const PLAN_LABEL: Record<UserProfile["plan"], string> = {
  FREE: "Gratuito",
  STANDARD: "Standard",
  PRO: "Pro",
};

const SUBSCRIPTION_LABEL: Record<string, string> = {
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-6 py-8 border-b border-hairline-soft last:border-none">
      <div className="sm:w-[260px] flex-shrink-0">
        <p className="text-[15px] font-medium text-ink">{label}</p>
        {description && (
          <p className="text-[13px] text-ink/45 mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function FieldInput({
  label,
  type = "text",
  value,
  onChange,
  error,
  placeholder,
  autoComplete,
  showToggle,
}: {
  label?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  autoComplete?: string;
  showToggle?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const resolvedType = showToggle ? (visible ? "text" : "password") : type;

  return (
    <div className="flex flex-col gap-2">
      {label && <label className="text-[13px] font-medium text-ink/70">{label}</label>}
      <div className="relative">
        <input
          type={resolvedType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={[
            "w-full bg-canvas border rounded-md px-4 py-3.5 text-[15px] text-ink placeholder-ink/35 outline-none",
            "transition-all duration-200",
            "focus:border-ink focus:shadow-[0_0_0_3px_rgba(0,0,0,0.06)]",
            error ? "border-red-400" : "border-hairline",
            showToggle ? "pr-12" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
        {showToggle && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setVisible((v) => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink transition-colors cursor-pointer"
          >
            {visible ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        )}
      </div>
      {error && <p className="text-[13px] text-red-500">{error}</p>}
    </div>
  );
}

function SaveButton({
  loading,
  saved,
  label = "Salvar",
}: {
  loading: boolean;
  saved: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="flex items-center gap-2 text-[14px] font-medium text-canvas bg-ink hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 rounded-pill transition-opacity cursor-pointer border-none"
    >
      {loading ? (
        <>
          <svg className="animate-spin" width="13" height="13" viewBox="0 0 12 12" fill="none">
            <path d="M6 1a5 5 0 1 0 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Salvando…
        </>
      ) : saved ? (
        <>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 6.5L5.5 10L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Salvo
        </>
      ) : (
        label
      )}
    </button>
  );
}

// ─── Section: General ─────────────────────────────────────────────────────────

function SectionGeneral({
  profile,
  onProfileUpdated,
}: {
  profile: UserProfile;
  onProfileUpdated: (p: UserProfile) => void;
}) {
  // Profile (apenas o nome é editável; e-mail é somente leitura)
  const [name, setName] = useState(profile.name ?? "");
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Password form
  const [password, setPassword] = useState<PasswordForm>({ current: "", next: "", confirm: "" });
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({});
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  function passwordField(key: keyof PasswordForm) {
    return (v: string) => {
      setPassword((p) => ({ ...p, [key]: v }));
      if (passwordErrors[key]) setPasswordErrors((e) => ({ ...e, [key]: undefined }));
    };
  }

  const validateName = useCallback((): boolean => {
    const errs: ProfileErrors = {};
    if (!name.trim()) errs.name = "Nome obrigatório.";
    setProfileErrors(errs);
    return Object.keys(errs).length === 0;
  }, [name]);

  const validatePassword = useCallback((): boolean => {
    const errs: PasswordErrors = {};
    if (!password.current) errs.current = "Senha atual obrigatória.";
    if (!password.next) errs.next = "Nova senha obrigatória.";
    else if (password.next.length < 6) errs.next = "Mínimo 6 caracteres.";
    else if (password.next === password.current) errs.next = "A nova senha deve ser diferente da atual.";
    if (!password.confirm) errs.confirm = "Confirme a nova senha.";
    else if (password.next !== password.confirm) errs.confirm = "As senhas não coincidem.";
    setPasswordErrors(errs);
    return Object.keys(errs).length === 0;
  }, [password]);

  const handleProfileSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validateName()) return;
      setProfileLoading(true);
      setProfileErrors({});
      try {
        const updated = await updateProfileName(name.trim());
        onProfileUpdated(updated);
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 2500);
      } catch (err) {
        const msg =
          axios.isAxiosError(err) && err.response?.status === 403
            ? "Confirme seu e-mail antes de alterar o perfil."
            : "Erro ao salvar. Tente novamente.";
        setProfileErrors({ general: msg });
      } finally {
        setProfileLoading(false);
      }
    },
    [name, onProfileUpdated, validateName],
  );

  const handlePasswordSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validatePassword()) return;
      setPasswordLoading(true);
      setPasswordErrors({});
      try {
        await changePassword(password.current, password.next);
        setPasswordSaved(true);
        setPassword({ current: "", next: "", confirm: "" });
        setTimeout(() => setPasswordSaved(false), 2500);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          if (err.response?.status === 401) {
            setPasswordErrors({ current: "Senha atual incorreta." });
          } else if (err.response?.status === 403) {
            setPasswordErrors({ general: "Confirme seu e-mail antes de trocar a senha." });
          } else {
            setPasswordErrors({ general: "Erro ao atualizar senha. Tente novamente." });
          }
        } else {
          setPasswordErrors({ general: "Erro ao atualizar senha. Tente novamente." });
        }
      } finally {
        setPasswordLoading(false);
      }
    },
    [password, validatePassword],
  );

  const initial = name?.[0]?.toUpperCase() ?? "?";

  return (
    <div style={{ animation: "fadeUp 0.35s ease both" }}>
      {/* Profile */}
      <form onSubmit={handleProfileSubmit} noValidate>
        <h3 className="eyebrow text-ink/40 mb-1">Perfil</h3>

        {profileErrors.general && (
          <div className="mb-5 bg-red-50 border border-red-200 rounded-md px-4 py-3 text-[14px] text-red-600">
            {profileErrors.general}
          </div>
        )}

        <SettingRow label="Nome" description="Seu nome de exibição na plataforma.">
          <div className="flex items-center gap-4">
            {/* Avatar initial */}
            <div className="w-12 h-12 rounded-full bg-ink flex-shrink-0 flex items-center justify-center text-canvas text-[17px] font-semibold select-none">
              {initial}
            </div>
            <div className="flex-1">
              <FieldInput
                value={name}
                onChange={(v) => {
                  setName(v);
                  if (profileErrors.name) setProfileErrors((e) => ({ ...e, name: undefined }));
                }}
                error={profileErrors.name}
                placeholder="Seu nome"
                autoComplete="name"
              />
            </div>
          </div>
        </SettingRow>

        <SettingRow
          label="E-mail"
          description="E-mail vinculado à sua conta. Não pode ser alterado."
        >
          <div className="flex items-center gap-3 bg-surface-soft border border-hairline rounded-md px-4 py-3.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-ink/35 flex-shrink-0">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <path d="m22 7-10 5L2 7" />
            </svg>
            <span className="text-[15px] text-ink/70 truncate min-w-0 flex-1" title={profile.email}>
              {profile.email}
            </span>
          </div>
        </SettingRow>

        <div className="pt-4 flex justify-end">
          <SaveButton loading={profileLoading} saved={profileSaved} />
        </div>
      </form>

      {/* Divider */}
      <div className="border-t border-hairline-soft my-8" />

      {/* Password */}
      <form onSubmit={handlePasswordSubmit} noValidate>
        <h3 className="eyebrow text-ink/40 mb-1">Senha</h3>

        {passwordErrors.general && (
          <div className="mb-5 bg-red-50 border border-red-200 rounded-md px-4 py-3 text-[14px] text-red-600">
            {passwordErrors.general}
          </div>
        )}

        <SettingRow label="Senha atual" description="Confirme sua senha atual antes de criar uma nova.">
          <FieldInput
            value={password.current}
            onChange={passwordField("current")}
            error={passwordErrors.current}
            placeholder="••••••••"
            autoComplete="current-password"
            showToggle
          />
        </SettingRow>

        <SettingRow label="Nova senha" description="Mínimo de 6 caracteres.">
          <div className="flex flex-col gap-3">
            <FieldInput
              label="Nova senha"
              value={password.next}
              onChange={passwordField("next")}
              error={passwordErrors.next}
              placeholder="••••••••"
              autoComplete="new-password"
              showToggle
            />
            <FieldInput
              label="Confirmar nova senha"
              value={password.confirm}
              onChange={passwordField("confirm")}
              error={passwordErrors.confirm}
              placeholder="••••••••"
              autoComplete="new-password"
              showToggle
            />
          </div>
        </SettingRow>

        <div className="pt-4 flex justify-end">
          <SaveButton loading={passwordLoading} saved={passwordSaved} label="Atualizar senha" />
        </div>
      </form>
    </div>
  );
}

// ─── Section: Language ────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷", available: true },
  { code: "en-US", label: "English (US)", flag: "🇺🇸", available: false },
];

function SectionLanguage() {
  // Só o português está disponível; inglês fica "em breve" (desabilitado).
  const selected = "pt-BR";

  return (
    <div style={{ animation: "fadeUp 0.35s ease both" }}>
      <h3 className="eyebrow text-ink/40 mb-1">Idioma</h3>

      <SettingRow
        label="Idioma da interface"
        description="Define o idioma exibido em toda a plataforma."
      >
        <div className="flex flex-col gap-3">
          {LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            const disabled = !lang.available;
            return (
              <div
                key={lang.code}
                aria-disabled={disabled}
                className={`flex items-center gap-3 sm:gap-5 px-4 sm:px-5 py-4 rounded-md border text-left transition-all duration-150 ${
                  disabled
                    ? "border-hairline bg-surface-soft/50 opacity-60 cursor-not-allowed"
                    : isSelected
                      ? "border-ink bg-surface-soft cursor-default"
                      : "border-hairline bg-canvas"
                }`}
              >
                {/* Radio indicator */}
                <div
                  className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                    isSelected && !disabled ? "border-ink" : "border-hairline"
                  }`}
                >
                  {isSelected && !disabled && <div className="w-2.5 h-2.5 rounded-full bg-ink" />}
                </div>

                <span className="text-[22px] sm:text-[26px] leading-none select-none flex-shrink-0">{lang.flag}</span>

                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className={`text-[14px] sm:text-[15px] font-medium truncate ${isSelected && !disabled ? "text-ink" : "text-ink/70"}`}>
                    {lang.label}
                  </span>
                  <span className="text-[13px] text-ink/40">{lang.code}</span>
                </div>

                {disabled && (
                  <span className="flex-shrink-0 text-[11px] sm:text-[12px] font-medium text-ink/45 bg-canvas border border-hairline rounded-pill px-2.5 sm:px-3 py-1 select-none">
                    Em breve
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </SettingRow>
    </div>
  );
}

// ─── Section: Payments ────────────────────────────────────────────────────────

function formatAmount(amountInCents: number, currency: string) {
  try {
    return (amountInCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: currency.toUpperCase(),
    });
  } catch {
    return `${(amountInCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const PAYMENT_STATUS_LABEL: Record<Payment["status"], string> = {
  PAID: "Pago",
  FAILED: "Falhou",
  REFUNDED: "Reembolsado",
};

function SectionPayments({
  profile,
  onProfileUpdated,
}: {
  profile: UserProfile;
  onProfileUpdated: (p: UserProfile) => void;
}) {
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const [canceling, setCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelDone, setCancelDone] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    setPaymentsError(null);
    try {
      const data = await fetchMyPayments();
      setPayments(data);
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.status === 403
          ? "Confirme seu e-mail para ver suas faturas."
          : "Não foi possível carregar suas faturas.";
      setPaymentsError(msg);
      setPayments([]);
    } finally {
      setLoadingPayments(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  const isActive = profile.subscriptionStatus === "active";

  async function handleCancel() {
    setCanceling(true);
    setCancelError(null);
    try {
      await cancelSubscription();
      setCancelDone(true);
      setConfirmingCancel(false);
      // Reflete o novo estado (volta para FREE / canceled)
      try {
        const fresh = await getProfile();
        onProfileUpdated(fresh);
      } catch {
        /* mantém o estado atual se a releitura falhar */
      }
    } catch (err) {
      let msg = "Não foi possível cancelar. Tente novamente.";
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 400) msg = "Você não possui uma assinatura ativa.";
        else if (err.response?.status === 403) msg = "Confirme seu e-mail antes de cancelar.";
      }
      setCancelError(msg);
    } finally {
      setCanceling(false);
    }
  }

  return (
    <div style={{ animation: "fadeUp 0.35s ease both" }}>
      {/* Plano atual */}
      <h3 className="eyebrow text-ink/40 mb-1">Assinatura</h3>

      <SettingRow label="Plano atual" description="Seu plano e status de assinatura.">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[20px] font-semibold text-ink">{PLAN_LABEL[profile.plan]}</span>
            {profile.subscriptionStatus && (
              <span
                className={`text-[12px] font-medium rounded-pill px-3 py-1 border ${
                  profile.subscriptionStatus === "active"
                    ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : profile.subscriptionStatus === "past_due"
                      ? "text-amber-700 bg-amber-50 border-amber-200"
                      : "text-ink/55 bg-surface-soft border-hairline"
                }`}
              >
                {SUBSCRIPTION_LABEL[profile.subscriptionStatus] ?? profile.subscriptionStatus}
              </span>
            )}
          </div>
          <p className="text-[14px] text-ink/55">
            <span className="font-medium text-ink">{profile.credits}</span> créditos disponíveis
          </p>

          {profile.plan === "FREE" && (
            <Link
              href="/plans"
              className="inline-flex w-fit items-center gap-2 text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-5 py-2.5 rounded-pill transition-opacity"
            >
              Ver planos
            </Link>
          )}
        </div>
      </SettingRow>

      {/* Cancelamento */}
      {isActive && (
        <SettingRow
          label="Cancelar assinatura"
          description="Você volta para o plano Gratuito. Os créditos já acumulados permanecem."
        >
          {cancelError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-md px-4 py-3 text-[14px] text-red-600">
              {cancelError}
            </div>
          )}

          {!confirmingCancel ? (
            <button
              type="button"
              onClick={() => {
                setConfirmingCancel(true);
                setCancelError(null);
              }}
              className="inline-flex items-center gap-2 text-[14px] font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-5 py-2.5 rounded-pill transition-colors cursor-pointer"
            >
              Cancelar assinatura
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[14px] text-ink/70">
                Tem certeza? Sua assinatura será cancelada e você voltará ao plano Gratuito.
              </p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={canceling}
                  className="inline-flex items-center gap-2 text-[14px] font-medium text-canvas bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed px-5 py-2.5 rounded-pill transition-colors cursor-pointer"
                >
                  {canceling ? (
                    <>
                      <svg className="animate-spin" width="13" height="13" viewBox="0 0 12 12" fill="none">
                        <path d="M6 1a5 5 0 1 0 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      Cancelando…
                    </>
                  ) : (
                    "Sim, cancelar"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  disabled={canceling}
                  className="inline-flex items-center text-[14px] font-medium text-ink/60 hover:text-ink px-5 py-2.5 rounded-pill transition-colors cursor-pointer"
                >
                  Manter assinatura
                </button>
              </div>
            </div>
          )}
        </SettingRow>
      )}

      {cancelDone && !isActive && (
        <div className="py-6 border-b border-hairline-soft">
          <div className="bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3 text-[14px] text-emerald-700">
            Assinatura cancelada. Você está no plano Gratuito; seus créditos restantes continuam disponíveis.
          </div>
        </div>
      )}

      {/* Histórico de faturas */}
      <div className="pt-2">
        <h3 className="eyebrow text-ink/40 mb-4">Histórico de faturas</h3>

        {loadingPayments ? (
          <div className="flex items-center gap-2 text-[14px] text-ink/45 py-6">
            <svg className="animate-spin" width="15" height="15" viewBox="0 0 12 12" fill="none">
              <path d="M6 1a5 5 0 1 0 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Carregando faturas…
          </div>
        ) : paymentsError ? (
          <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-[14px] text-red-600">
            {paymentsError}
          </div>
        ) : payments && payments.length > 0 ? (
          <div className="flex flex-col divide-y divide-hairline-soft border border-hairline rounded-lg overflow-hidden">
            {payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 sm:px-5 py-4 bg-canvas">
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-[15px] font-medium text-ink truncate">
                    {PLAN_LABEL[p.plan]} · {formatAmount(p.amount, p.currency)}
                  </span>
                  <span className="text-[13px] text-ink/45">
                    {formatDate(p.paidAt)} · {PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {p.hostedInvoiceUrl && (
                    <a
                      href={p.hostedInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium text-ink/70 hover:text-ink border border-hairline hover:border-ink/30 rounded-pill px-3.5 py-2 transition-colors"
                    >
                      Ver recibo
                    </a>
                  )}
                  {p.invoicePdfUrl && (
                    <a
                      href={p.invoicePdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] font-medium text-ink/70 hover:text-ink border border-hairline hover:border-ink/30 rounded-pill px-3.5 py-2 transition-colors"
                    >
                      PDF
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-hairline rounded-lg px-5 py-10 text-center">
            <p className="text-[14px] text-ink/45">Nenhuma fatura ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV: { key: SettingsSection; label: string; icon: React.ReactNode }[] = [
  {
    key: "general",
    label: "Geral",
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M8 1.5v1M8 13.5v1M1.5 8h1M13.5 8h1M3.4 3.4l.7.7M11.9 11.9l.7.7M3.4 12.6l.7-.7M11.9 4.1l.7-.7"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: "payments",
    label: "Pagamentos",
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M4 10h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "language",
    label: "Idioma",
    icon: (
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 2C8 2 6 4.5 6 8s2 6 2 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M8 2c0 0 2 2.5 2 6s-2 6-2 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M2 8h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [active, setActive] = useState<SettingsSection>("general");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getProfile();
        if (!cancelled) setProfile(data);
      } catch {
        if (!cancelled) setProfileError(true);
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-canvas relative overflow-hidden">
      {/* Dot grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage: "radial-gradient(circle, #e2e2e2 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 70% at 50% 30%, transparent 30%, #fff 80%)",
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 py-10 sm:py-14">
        {/* Page title */}
        <div className="mb-12" style={{ animation: "fadeUp 0.4s ease both" }}>
          {/* Back to dashboard */}
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-2 text-[13px] text-ink/45 hover:text-ink transition-colors w-fit mb-4"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className="transition-transform duration-200 group-hover:-translate-x-0.5"
            >
              <path
                d="M9 2.5L4.5 7L9 11.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Voltar para o dashboard
          </Link>

          <span className="eyebrow text-ink/40 block">Conta</span>
          <h1 className="display-lg text-ink !text-[26px] sm:!text-[34px] mt-2">Configurações</h1>
        </div>

        <div className="flex gap-4 sm:gap-8 lg:gap-12">
          {/* ── Sidebar nav (auto-minimiza para só ícones abaixo de lg) ── */}
          <nav
            className="w-auto lg:w-[220px] flex-shrink-0 flex flex-col gap-1"
            style={{ animation: "fadeUp 0.4s 0.05s ease both" }}
          >
            {NAV.map((item) => {
              const isActive = active === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActive(item.key)}
                  title={item.label}
                  aria-label={item.label}
                  className={`flex items-center justify-center lg:justify-start gap-3.5 px-3 lg:px-4 py-3 rounded-md text-[15px] font-medium transition-all duration-150 cursor-pointer w-full text-left ${
                    isActive
                      ? "bg-surface-soft text-ink"
                      : "text-ink/55 hover:bg-surface-soft hover:text-ink"
                  }`}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* ── Content panel ── */}
          <div
            className="flex-1 min-w-0 bg-canvas border border-hairline rounded-lg px-5 sm:px-10 py-8 sm:py-10 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
            style={{ animation: "fadeUp 0.4s 0.1s ease both" }}
          >
            {/* Section heading */}
            <h2 className="text-[24px] font-semibold text-ink tracking-tight mb-8">
              {NAV.find((n) => n.key === active)?.label}
            </h2>

            {loadingProfile ? (
              <div className="flex items-center gap-2 text-[14px] text-ink/45 py-8">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1a5 5 0 1 0 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                Carregando…
              </div>
            ) : profileError || !profile ? (
              <div className="bg-red-50 border border-red-200 rounded-md px-4 py-3 text-[14px] text-red-600">
                Não foi possível carregar seus dados. Atualize a página e tente novamente.
              </div>
            ) : (
              <>
                {active === "general" && (
                  <SectionGeneral profile={profile} onProfileUpdated={setProfile} />
                )}
                {active === "payments" && (
                  <SectionPayments profile={profile} onProfileUpdated={setProfile} />
                )}
                {active === "language" && <SectionLanguage />}
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
