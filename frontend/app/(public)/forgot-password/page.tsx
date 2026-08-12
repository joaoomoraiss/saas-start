// app/forgot-password/page.tsx

import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";
import ForgotPassword from "@/components/forgotPassword";

export const metadata: Metadata = {
  title: "Esqueci a senha",
  description: `Recupere o acesso à sua conta ${siteConfig.name}.`,
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return <ForgotPassword />;
}