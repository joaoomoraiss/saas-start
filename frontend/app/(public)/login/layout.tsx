import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";

export const metadata: Metadata = {
  title: "Entrar",
  description: `Acesse sua conta ${siteConfig.name}.`,
  robots: { index: false, follow: false },
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
