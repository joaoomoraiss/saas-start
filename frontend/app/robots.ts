import type { MetadataRoute } from "next";
import { siteUrl } from "@/libs/siteConfig";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Áreas autenticadas e utilitárias não devem ser rastreadas.
      disallow: [
        "/dashboard",
        "/settings",
        "/success",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/confirm",
        "/api/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
