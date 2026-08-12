# saas-start

Boilerplate de SaaS: autenticação, verificação de e-mail, reset de senha,
assinatura via Stripe, landing page e páginas legais já prontas. Clone,
troque a marca e comece pelo domínio do produto.

```
backend/    NestJS + Prisma + PostgreSQL  (auth, users, mail, CASL, roles)
frontend/   Next.js 16 (App Router) + Tailwind v4
docs/       Arquitetura de pagamentos (agnóstica de framework)
```

## Rodando local

**Backend** — precisa de PostgreSQL (o `docker-compose.yaml` sobe um):

```bash
cd backend
cp .env.example .env    # preencha os JWT_* com: openssl rand -hex 32
npm install
docker compose up -d
npx prisma migrate dev
npm run start:dev
```

**Frontend:**

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

`JWT_SECRET` precisa ser idêntico nos dois lados: o `proxy.ts` valida o
refreshToken localmente para proteger as rotas privadas.

## Ao começar um projeto novo

1. `frontend/libs/siteConfig.ts` — nome, descrição, e-mails, keywords. É o
   único lugar com a marca; nenhum componente tem o nome cravado.
2. `frontend/public/Logo.png` e `frontend/app/favicon.ico`.
3. `frontend/components/hero`, `features`, `marqueeLandingPage`,
   `ctaLandingPage` — o texto está em constantes no topo de cada arquivo.
4. `frontend/components/pricing` — nomes, preços e features dos planos. Os ids
   `FREE`/`STANDARD`/`PRO` precisam bater com o enum `Plan` do backend.
5. Páginas legais (`/termos-de-uso`, `/politica-de-privacidade`,
   `/politica-de-cookies`) são um rascunho genérico — revise antes de publicar.

## Rotas protegidas

`frontend/proxy.ts` é fail-closed: tudo que não está em `publicRoutes` exige
sessão. Rotas sob `/admin` exigem `role: "ADMIN"` no JWT. O proxy é só a
primeira camada — os guards do backend continuam sendo a autoridade.
