# syntax=docker/dockerfile:1

# Imagem da API. Tres alvos:
#   build   — dependencias completas + codigo compilado
#   migrate — roda `prisma migrate deploy` (usado pelo docker-compose da raiz)
#   runtime — so o necessario para servir, sem devDependencies
#
# bookworm-slim (glibc) em vez de alpine: o bcrypt usa binario nativo, e os
# prebuilds para musl nem sempre existem — no alpine o build precisaria de
# python/make/g++.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Manifesto + schema primeiro: o postinstall roda `prisma generate`, e esta
# camada so e refeita quando dependencias ou schema mudam.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run build

# ─── migrate ──────────────────────────────────────────────────────────────────
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# ─── dependencias de producao ─────────────────────────────────────────────────
FROM build AS prod-deps
RUN npm prune --omit=dev

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=prod-deps --chown=node:node /app/package.json ./
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/src/main"]
