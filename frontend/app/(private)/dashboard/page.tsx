"use client";

import Link from "next/link";
import ComingSoon from "@/components/dashboard/comingSoon";
import Sidebar, {
  SIDEBAR_CLOSED_WIDTH,
  SIDEBAR_OPEN_WIDTH,
} from "@/components/dashboard/sidebar";
import { useDashboard } from "@/components/dashboard/useDashboard";

const PLAN_LABEL: Record<string, string> = {
  FREE: "Gratuito",
  STANDARD: "Standard",
  PRO: "Pro",
};

const SUBSCRIPTION_LABEL: Record<string, string> = {
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceling: "Cancelamento agendado",
  canceled: "Cancelada",
};

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hairline rounded-lg p-6">
      <p className="caption-mono text-ink/45 mb-2">{label}</p>
      <p className="text-[26px] font-semibold text-ink tracking-tight leading-none">
        {value}
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const {
    activeSection,
    setActiveSection,
    sidebarOpen,
    setSidebarOpen,
    profile,
    loadingProfile,
  } = useDashboard();

  const sidebarWidth = sidebarOpen ? SIDEBAR_OPEN_WIDTH : SIDEBAR_CLOSED_WIDTH;

  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        profile={profile}
      />

      <main
        className="relative z-10 min-h-screen transition-all duration-300 ease-in-out"
        style={{ marginLeft: sidebarWidth }}
      >
        <div className="max-w-5xl mx-auto px-6 py-10">
          {activeSection === "overview" && (
            <section style={{ animation: "fadeUp 0.4s ease both" }}>
              <p className="eyebrow text-ink/45 mb-3">Visão geral</p>
              <h1 className="display-xl text-ink mb-2">
                Olá{profile?.name ? `, ${profile.name.split(" ")[0]}` : ""}.
              </h1>
              <p className="text-[16px] text-ink/55 mb-10">
                Este é o ponto de partida da área logada. Troque este bloco pelo
                conteúdo principal do seu produto.
              </p>

              {loadingProfile ? (
                <div className="grid sm:grid-cols-3 gap-4">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="border border-hairline rounded-lg p-6 h-[104px] animate-pulse bg-surface-soft"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-3 gap-4">
                  <StatCard
                    label="Plano"
                    value={PLAN_LABEL[profile?.plan ?? "FREE"] ?? "—"}
                  />
                  <StatCard
                    label="Créditos"
                    value={String(profile?.credits ?? 0)}
                  />
                  <StatCard
                    label="Assinatura"
                    value={
                      profile?.subscriptionStatus
                        ? (SUBSCRIPTION_LABEL[profile.subscriptionStatus] ??
                          profile.subscriptionStatus)
                        : "Sem assinatura"
                    }
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-3 mt-8">
                <Link
                  href="/plans"
                  className="inline-flex items-center text-[14px] font-medium text-canvas bg-ink hover:opacity-90 px-5 py-2.5 rounded-[5px] transition-all duration-200"
                >
                  Ver planos
                </Link>
                <Link
                  href="/settings"
                  className="inline-flex items-center text-[14px] font-medium text-ink border border-hairline hover:border-ink px-5 py-2.5 rounded-[5px] transition-all duration-200"
                >
                  Configurações
                </Link>
              </div>
            </section>
          )}

          {activeSection === "activity" && (
            <ComingSoon
              title="Atividade"
              description="Um exemplo de seção ainda não implementada. Use este componente enquanto a feature não fica pronta."
            />
          )}
        </div>
      </main>
    </div>
  );
}
