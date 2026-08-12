# saas-start

Boilerplate de SaaS: autenticação, verificação de e-mail, reset de senha,
assinatura via Stripe, landing page e páginas legais já prontas. Clone,
troque a marca e comece pelo domínio do produto.

```
backend/    NestJS + Prisma + PostgreSQL
            auth, users, mail, CASL/roles, assinaturas Stripe
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

O backend sobe na **8080** e o frontend na **3000**.

`JWT_REFRESH_SECRET` precisa ser idêntico nos dois lados — repare que é o
secret de *refresh*, não o `JWT_SECRET`. O `proxy.ts` valida o cookie
`refreshToken` localmente para proteger as rotas privadas, e é com esse secret
que o backend assina o cookie. Cada tipo de token tem o seu (o boot do backend
recusa secrets repetidos).

`FRONTEND_URL` no backend precisa apontar para onde o Next está servindo: é a
base dos links de confirmação de e-mail (`/confirm?token=`) e de reset de senha
(`/reset-password?token=`).

## Pagamentos (Stripe)

Opcional e **tudo ou nada**: sem `STRIPE_SECRET_KEY` a aplicação sobe normal e
as rotas `/payments` respondem 503. Preencher só parte do grupo quebra o boot
de propósito — meia configuração aceita checkout e nunca libera o plano.

Para ligar, preencha as quatro variáveis em `backend/.env` e rode o listener:

```bash
stripe listen --forward-to localhost:8080/payments/webhook
```

O segredo que ele imprime (`whsec_...`) é o `STRIPE_WEBHOOK_SECRET`.

Regras que valem a pena conhecer antes de mexer:

- O **webhook é a única fonte de verdade**. A volta do usuário para `/success`
  não prova pagamento — a página faz polling em `GET /user/profile`.
- O cliente manda só o **nome do plano**; o Price ID é resolvido no backend a
  partir da env. Nunca aceite preço vindo do request.
- Créditos são concedidos em **um único caminho por cobrança**:
  `checkout.session.completed` na assinatura inicial, `invoice.payment_succeeded`
  só nas renovações (`subscription_cycle`). Creditar nos dois dá em dobro.

Cotas e Price IDs por plano: `backend/src/payments/plan.config.ts`.
A arquitetura completa está em `docs/PAYMENT_ARCHITECTURE.md`.

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
