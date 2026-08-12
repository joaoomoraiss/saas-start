import type { Metadata } from "next";
import { siteConfig } from "@/libs/siteConfig";

export const metadata: Metadata = {
  title: "Criar conta",
  description: `Crie sua conta ${siteConfig.name} e comece a usar em segundos.`,
  robots: { index: false, follow: false },
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
