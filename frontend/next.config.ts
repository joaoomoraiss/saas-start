import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autocontido em .next/standalone: a imagem Docker leva so o que o
  // servidor precisa, sem node_modules inteiro. Ver frontend/Dockerfile.
  output: "standalone",
};

export default nextConfig;
