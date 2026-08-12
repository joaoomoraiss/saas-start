// app/reset-password/page.tsx

import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";
import NewPasswordForm from "@/components/newPasswordForm";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "Redefinir senha",
  description: `Defina uma nova senha para sua conta ${siteConfig.name}.`,
  robots: { index: false, follow: false },
};


function LoadingFallback() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <svg className="animate-spin text-ink" width="32" height="32" viewBox="0 0 32 32" fill="none">
        <path
          d="M16 3a13 13 0 1 0 13 13"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NewPasswordForm />
    </Suspense>
  );
}