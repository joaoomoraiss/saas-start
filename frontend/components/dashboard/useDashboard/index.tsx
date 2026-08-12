"use client";

// Estado compartilhado da área logada: perfil do usuário + chrome do dashboard
// (seção ativa, sidebar). Ao criar um recurso novo (projetos, pedidos, posts…),
// carregue-o aqui e devolva junto — a página do dashboard só consome.

import { useCallback, useEffect, useState } from "react";
import { getProfile, type UserProfile } from "@/services/user";

export type DashboardSection = "overview" | "activity";

export function useDashboard() {
  const [activeSection, setActiveSection] =
    useState<DashboardSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const loadProfile = useCallback(async () => {
    setLoadingProfile(true);
    try {
      setProfile(await getProfile());
    } catch (err) {
      console.error("Error loading profile:", err);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  return {
    activeSection,
    setActiveSection,
    sidebarOpen,
    setSidebarOpen,
    profile,
    loadingProfile,
    refetchProfile: loadProfile,
  };
}
