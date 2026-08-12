"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, type UserProfile } from "@/services/user";

interface SidebarProfileProps {
  profile: UserProfile | null;
  sidebarOpen: boolean;
}

const PLAN_LABEL: Record<string, string> = {
  FREE: "Gratuito",
  STANDARD: "Standard",
  PRO: "Pro",
};

const PLAN_COLORS: Record<string, string> = {
  FREE: "text-ink/50 bg-surface-soft",
  STANDARD: "text-ink bg-surface-soft",
  PRO: "text-accent bg-[rgba(83,58,253,0.1)]",
};

export default function SidebarProfile({
  profile,
  sidebarOpen,
}: SidebarProfileProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha o popover ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      // Mesmo se a chamada falhar, tira o usuário da área logada.
      router.push("/login");
      router.refresh();
    }
  }

  const plan = profile?.plan ?? "FREE";

  return (
    <div ref={containerRef} className="relative mt-auto">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-surface-soft transition-colors cursor-pointer group ${
          open ? "bg-surface-soft" : ""
        }`}
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-ink flex-shrink-0 flex items-center justify-center text-canvas text-[13px] font-semibold select-none">
          {profile?.name?.charAt(0).toUpperCase() ?? "U"}
        </div>

        {sidebarOpen && (
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[13px] font-medium text-ink truncate leading-tight">
              {profile?.name ?? "Usuário"}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <span
                className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none ${PLAN_COLORS[plan]}`}
              >
                {PLAN_LABEL[plan] ?? "—"}
              </span>
              {profile && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-ink/55 leading-none">
                  <svg width="9" height="9" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7.5 1L2.5 8H6.5L6 13L11.5 6H7.5L7.5 1Z"
                      fill="var(--color-accent)"
                      stroke="var(--color-accent)"
                      strokeWidth="1"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {profile.credits} créditos
                </span>
              )}
            </div>
          </div>
        )}

        {sidebarOpen && (
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            className={`flex-shrink-0 text-ink/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <path
              d="M3 5.5L7 9.5L11 5.5"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          className={`absolute bottom-full mb-2 z-50 bg-canvas border border-hairline rounded-lg shadow-lg py-1 overflow-hidden
            ${sidebarOpen ? "left-0 right-0" : "left-0 w-[180px]"}`}
          style={{ animation: "popoverIn 0.15s ease both" }}
        >
          <button
            onClick={() => router.push("/settings")}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-ink/65 hover:bg-surface-soft hover:text-ink transition-colors cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M7.5 9.5A2 2 0 1 0 7.5 5.5a2 2 0 0 0 0 4ZM12.2 7.5c0-.23-.02-.46-.05-.68l1.44-1.12a.35.35 0 0 0 .08-.44L12.3 3.24a.35.35 0 0 0-.43-.15l-1.7.68a5.1 5.1 0 0 0-1.17-.68l-.26-1.8A.34.34 0 0 0 8.4 1H6.6a.34.34 0 0 0-.34.29l-.26 1.8c-.42.17-.81.4-1.17.68L3.13 3.09a.35.35 0 0 0-.43.15L1.33 5.26a.35.35 0 0 0 .08.44l1.44 1.12A5.2 5.2 0 0 0 2.8 7.5c0 .23.02.46.05.68L1.41 9.3a.35.35 0 0 0-.08.44l1.37 2.02c.09.14.27.2.43.15l1.7-.68c.36.28.75.51 1.17.68l.26 1.8c.04.19.2.29.34.29h1.8c.15 0 .3-.1.34-.29l.26-1.8c.42-.17.81-.4 1.17-.68l1.7.68c.16.05.34 0 .43-.15l1.37-2.02a.35.35 0 0 0-.08-.44L12.15 8.18c.03-.22.05-.45.05-.68Z"
                stroke="currentColor"
                strokeWidth="1.1"
              />
            </svg>
            Configurações
          </button>

          <div className="border-t border-hairline-soft my-1" />

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M5.5 13H3a1.5 1.5 0 0 1-1.5-1.5v-8A1.5 1.5 0 0 1 3 2h2.5M10 10.5l3-3-3-3M13 7.5H5.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sair
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes popoverIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
