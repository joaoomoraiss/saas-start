"use client";

import Image from "next/image";
import Link from "next/link";
import Logo from "@/public/Logo.png";
import { siteConfig } from "@/libs/siteConfig";
import { DashboardSection } from "../useDashboard";
import SidebarProfile from "../sideBarProfile";
import { UserProfile } from "@/services/user";
import VerifyEmailButton from "../verifyEmailButton";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  activeSection: DashboardSection;
  onSectionChange: (section: DashboardSection) => void;
  profile: UserProfile | null;
}

interface NavItem {
  key: DashboardSection;
  label: string;
  icon: React.ReactNode;
}

// Adicione aqui as seções do seu produto — o tipo DashboardSection
// (useDashboard) é quem define as chaves válidas.
const NAV_ITEMS: NavItem[] = [
  {
    key: "overview",
    label: "Visão geral",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <rect
          x="1.5"
          y="1.5"
          width="6.5"
          height="6.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="10"
          y="1.5"
          width="6.5"
          height="6.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="1.5"
          y="10"
          width="6.5"
          height="6.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <rect
          x="10"
          y="10"
          width="6.5"
          height="6.5"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
      </svg>
    ),
  },
  {
    key: "activity",
    label: "Atividade",
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
        <path
          d="M2.5 5.5h13M2.5 9h9M2.5 12.5h6"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

// Larguras exportadas para a página do dashboard alinhar a margem do conteúdo.
export const SIDEBAR_OPEN_WIDTH = 260;
export const SIDEBAR_CLOSED_WIDTH = 72;

export default function Sidebar({
  open,
  onToggle,
  activeSection,
  onSectionChange,
  profile,
}: SidebarProps) {
  return (
    <aside
      style={{ width: open ? SIDEBAR_OPEN_WIDTH : SIDEBAR_CLOSED_WIDTH }}
      className="fixed top-0 left-0 h-screen z-40 flex flex-col bg-canvas border-r border-hairline transition-all duration-300 ease-in-out"
    >
      {/* Header: logo + toggle */}
      <div className="flex items-center justify-between px-4 h-14 flex-shrink-0 border-b border-hairline-soft">
        {open && (
          <Link
            href="/"
            className="flex items-center gap-2 overflow-hidden group"
          >
            <Image
              src={Logo}
              alt={siteConfig.name}
              priority
              className="w-7 h-7 object-contain flex-shrink-0"
            />
            <span
              className="text-[15px] font-semibold text-ink tracking-tight whitespace-nowrap group-hover:opacity-70 transition-opacity"
              style={{ animation: "fadeIn 0.2s ease both" }}
            >
              {siteConfig.name}
            </span>
          </Link>
        )}

        <button
          onClick={onToggle}
          className={`w-8 h-8 flex items-center justify-center rounded-full text-ink/45 hover:text-ink hover:bg-surface-soft transition-colors cursor-pointer flex-shrink-0 ${!open ? "mx-auto" : ""}`}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 14 14"
            fill="none"
            className={`transition-transform duration-300 ${open ? "" : "rotate-180"}`}
          >
            <path
              d="M9 2.5L4.5 7L9 11.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {open && (
          <span className="eyebrow text-ink/40 px-3 pb-2">Workspace</span>
        )}
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onSectionChange(item.key)}
              title={!open ? item.label : undefined}
              className={`
                w-full flex items-center gap-3.5 px-3 py-2.5 rounded-md
                text-[14px] font-medium transition-all duration-150 cursor-pointer
                ${
                  isActive
                    ? "bg-surface-soft text-ink"
                    : "text-ink/55 hover:bg-surface-soft hover:text-ink"
                }
                ${!open ? "justify-center" : ""}
              `}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {open && (
                <span
                  className="truncate whitespace-nowrap"
                  style={{ animation: "fadeIn 0.2s ease both" }}
                >
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Aviso de e-mail não confirmado */}
      {profile && !profile.isVerified && (
        <VerifyEmailButton profile={profile} sidebarOpen={open} />
      )}

      <div className="px-3 pb-5 pt-3 border-t border-hairline-soft flex-shrink-0">
        <SidebarProfile profile={profile} sidebarOpen={open} />
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </aside>
  );
}
