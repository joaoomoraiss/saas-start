import { ImageResponse } from "next/og";
import { siteConfig } from "@/libs/siteConfig";

// Imagem Open Graph / Twitter aplicada automaticamente às rotas públicas.
export const alt = siteConfig.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0a0a",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 38, opacity: 0.6, marginBottom: 16 }}>
          {siteConfig.name}
        </div>
        <div style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.1 }}>
          {siteConfig.title}
        </div>
        <div
          style={{
            fontSize: 32,
            opacity: 0.75,
            marginTop: 28,
            maxWidth: 900,
            lineHeight: 1.3,
          }}
        >
          {siteConfig.description}
        </div>
      </div>
    ),
    { ...size },
  );
}
