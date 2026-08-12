import type { MetadataRoute } from "next";
import { siteUrl } from "@/libs/siteConfig";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  // Apenas rotas públicas e indexáveis. Páginas de autenticação e a área
  // autenticada ficam de fora (são noindex / disallow no robots.txt).
  return [
    {
      url: `${siteUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/plans`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${siteUrl}/sobre`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/contato`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/termos-de-uso`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/politica-de-privacidade`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/politica-de-cookies`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
