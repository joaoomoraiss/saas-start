"use client";

import { useState } from "react";
import { type UserProfile } from "@/services/user";
import EmailVerifyPopup from "../emailVerifyPopup";

interface VerifyEmailButtonProps {
  profile: UserProfile | null;
  sidebarOpen: boolean;
}

const EnvelopeIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
    <path
      d="M1 3.5l6 4.5 6-4.5M1 3.5h12v8H1z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function VerifyEmailButton({
  profile,
  sidebarOpen,
}: VerifyEmailButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {sidebarOpen ? (
        <div className="mx-3 mb-3">
          <button
            onClick={() => setOpen(true)}
            disabled={!profile?.email}
            className="w-full flex items-center justify-center gap-2 rounded-pill py-2 text-[13px] font-medium transition-all cursor-pointer border bg-canvas border-hairline text-ink hover:bg-surface-soft hover:border-ink disabled:opacity-50"
          >
            <EnvelopeIcon />
            Verificar e-mail
          </button>
        </div>
      ) : (
        // Sidebar fechada: ícone compacto com tooltip
        <div className="flex justify-center mb-2">
          <button
            onClick={() => setOpen(true)}
            disabled={!profile?.email}
            title="Verificar e-mail"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-surface-soft text-ink/70 hover:text-ink hover:bg-hairline transition-colors cursor-pointer disabled:opacity-50"
          >
            <EnvelopeIcon />
          </button>
        </div>
      )}

      {open && (
        <EmailVerifyPopup
          email={profile?.email ?? null}
          autoSend
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
