# saas-start

Boilerplate de SaaS: autenticação com sessões revogáveis, verificação de
e-mail, reset de senha, assinatura via Stripe, captcha, rate limit, LGPD
(exportar/excluir conta, banner de cookies), landing page e páginas legais já
prontas. Clone, troque a marca e comece pelo domínio do produto.

```
backend/    NestJS + Prisma + PostgreSQL
            auth, sessões, users, e-mail (Resend), captcha (Turnstile),
            CASL/roles, rate limit, assinaturas Stripe, contato, health
frontend/   Next.js 16 (App Router) + Tailwind v4
            BFF em /api, proxy de rotas, banner de cookies
docs/       Arquitetura de pagamentos e guia de deploy
```

## Arquitetura em uma frase

O browser só fala com o Next. As rotas `/api/*` do Next (BFF) guardam a sessão
em cookies httpOnly, mandam o token para a API e se identificam com o
`SERVICE_TOKEN`. A Stripe fala direto com a API, pelo webhook.

```
browser ──> Next (páginas + /api BFF) ──> NestJS ──> PostgreSQL
                                             ^
                              Stripe webhook ┘
```

## Rodando local

### 1. Backend

Precisa de PostgreSQL (o `backend/docker-compose.yaml` sobe um):

```bash
cd backend
cp .env.example .env
npm install
docker compose up -d
npx prisma migrate dev
npm run start:dev
```

Antes de subir, preencha no `backend/.env` os secrets obrigatórios. Gere cada
um com `openssl rand -hex 32` e use um valor diferente para cada:

| Variável | Observação |
|---|---|
| `JWT_SECRET` | **copie o mesmo valor** para o `frontend/.env.local` |
| `JWT_REFRESH_SECRET` | só no backend |
| `JWT_VERIFY_SECRET` | só no backend |
| `JWT_FORGOT_SECRET` | só no backend |
| `SERVICE_TOKEN` | **copie o mesmo valor** para o `frontend/.env.local` |

### 2. Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

No `frontend/.env.local`, preencha `JWT_SECRET` e `SERVICE_TOKEN` com os
**mesmos valores** do backend.

O backend sobe na **8080** e o frontend na **3000**. Sem Resend, Turnstile e
Stripe configurados, tudo funciona em modo de desenvolvimento: os e-mails não
saem (os links aparecem no log do backend), o cadastro fica sem captcha e
`/payments` responde 503.

## Variáveis para preencher à mão

Estas dependem de contas em serviços externos. Os campos já estão nos
`.env.example`, vazios, marcados com **PREENCHER A MAO**.

### Resend (envio de e-mail)

Usado na confirmação de e-mail, no reset de senha e no formulário de contato.

| Arquivo | Variável | Onde pegar |
|---|---|---|
| `backend/.env` | `RESEND_API_KEY` | API key (começa com `re_`) |
| `backend/.env` | `MAIL_FROM` | remetente num domínio verificado |
| `backend/.env` | `CONTACT_EMAIL` | caixa que recebe o formulário de contato |

Passo a passo:

1. Crie uma conta em [resend.com](https://resend.com).
2. Em **Domains → Add Domain**, adicione o seu domínio.
3. Crie no seu provedor de DNS os registros que o Resend mostrar (SPF e DKIM).
   Espere o status virar **Verified**.
4. Em **API Keys → Create API Key**, crie uma chave com permissão
   **Sending access**. Copie o valor para `RESEND_API_KEY`.
5. Preencha `MAIL_FROM` com um endereço do domínio verificado, por exemplo
   `"Acme <no-reply@acme.com>"`.
6. Preencha `CONTACT_EMAIL` com a caixa que deve receber as mensagens do site.
7. Reinicie o backend.

`RESEND_API_KEY` e `MAIL_FROM` são tudo ou nada: preencher só uma das duas
quebra o boot de propósito.

Para testar sem domínio próprio, use `MAIL_FROM="onboarding@resend.dev"`. Nesse
modo o Resend só entrega para o e-mail dono da conta.

### Cloudflare Turnstile (captcha do cadastro)

| Arquivo | Variável | Onde pegar |
|---|---|---|
| `frontend/.env.local` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site Key (pública) |
| `backend/.env` | `TURNSTILE_SECRET_KEY` | Secret Key |

Passo a passo:

1. Entre em [dash.cloudflare.com](https://dash.cloudflare.com) e abra
   **Turnstile → Add widget**. É gratuito e não exige que o domínio esteja na
   Cloudflare.
2. Em **Hostnames**, adicione o seu domínio. Para desenvolver, adicione também
   `localhost`.
3. Em **Widget Mode**, escolha **Managed**.
4. Copie a **Site Key** para `NEXT_PUBLIC_TURNSTILE_SITE_KEY` no frontend.
5. Copie a **Secret Key** para `TURNSTILE_SECRET_KEY` no backend.
6. Reinicie o backend e o frontend. Variáveis `NEXT_PUBLIC_*` são lidas no
   build, então em produção é preciso gerar o build de novo.

As duas chaves precisam ser **do mesmo widget**. Uma site key de um widget com
a secret de outro faz toda verificação falhar.

A validação acontece no backend, conferindo também o domínio (derivado de
`FRONTEND_URL`) e a tela (`action: "register"`). Com o secret configurado, a
verificação falha fechada: se a Cloudflare não responder, o cadastro é
recusado.

Para desenvolver sem criar widget, use as chaves de teste da Cloudflare. Troque
**as duas juntas**:

| Comportamento | Site key | Secret key |
|---|---|---|
| Sempre aprova | `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` |
| Sempre recusa | `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` |

⚠️ Com as duas variáveis vazias, o cadastro funciona **sem captcha**. Isso é
aceitável em desenvolvimento, mas não em produção. O backend avisa no log
quando sobe em produção sem `TURNSTILE_SECRET_KEY`.

### Stripe (pagamentos)

Opcional e **tudo ou nada**: sem `STRIPE_SECRET_KEY` a aplicação sobe normal e
`/payments` responde 503. Preencher só parte do grupo quebra o boot de
propósito, porque meia configuração aceita checkout e nunca libera o plano.

1. Pegue a chave de teste (`sk_test_...`) em
   [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys).
2. Crie um produto com um preço mensal para cada plano pago. Copie os Price IDs
   para `STRIPE_PRICE_ID_STANDARD` e `STRIPE_PRICE_ID_PRO`.
3. Rode o listener e copie o `whsec_...` que ele imprime para
   `STRIPE_WEBHOOK_SECRET`:

```bash
stripe listen --forward-to localhost:8080/payments/webhook
```

Chave `sk_live_` fora de `NODE_ENV=production` quebra o boot, e `sk_test_` em
produção também. Os eventos que o webhook de produção precisa assinar estão em
[docs/DEPLOY.md](docs/DEPLOY.md).

### Google Analytics (opcional)

`NEXT_PUBLIC_GA_ID` no frontend. O script só carrega depois que a pessoa
clica em "Aceitar" no banner de cookies.

## Docker

O `docker-compose.yml` da raiz sobe a stack completa: Postgres, migrations,
API e front.

```bash
# backend/.env e frontend/.env.local precisam existir e estar preenchidos
docker compose up --build
```

- As migrations rodam num serviço próprio (`migrate`), e a API só sobe depois
  que ele termina bem.
- Dentro do compose, `DATABASE_URL` e `BACKEND_URL` são sobrescritas para os
  nomes dos serviços (`db`, `backend`).
- Variáveis `NEXT_PUBLIC_*` são embutidas no build do front. O compose as lê do
  shell ou de um `.env` **na raiz**, não do `frontend/.env.local`.
- O `backend/docker-compose.yaml` continua existindo para desenvolver com hot
  reload (só o banco). Os dois publicam a porta 5432: suba um de cada vez.

## Segurança que já vem pronta

- **Sessões no banco.** Cada refresh token vira uma linha (guardada por hash).
  O logout revoga a sessão de verdade. Trocar a senha derruba as outras
  sessões, e o reset de senha derruba todas.
- **Rotação com detecção de reuso.** Um refresh token já trocado, reapresentado
  depois de 30 segundos, é tratado como roubo e derruba todas as sessões do
  usuário. A janela de 30 segundos cobre requisições concorrentes legítimas.
- **Link de reset de uso único.**
- **Rate limit por IP real**, com limites mais apertados em login, cadastro,
  envio de e-mail, troca de senha, checkout e contato. Veja
  `backend/src/common/throttle/limits.ts`.
- **Captcha no cadastro**, validado no backend.
- **Tokens fora do alcance do JavaScript.** O browser só vê cookies httpOnly
  do próprio domínio.

## Pagamentos: regras antes de mexer

- O **webhook é a única fonte de verdade**. A volta do usuário para `/success`
  não prova pagamento; a página faz polling em `GET /user/profile`.
- O cliente manda só o **nome do plano**. O Price ID é resolvido no backend a
  partir da env.
- Créditos são concedidos em **um único caminho por cobrança**:
  `checkout.session.completed` na assinatura inicial e
  `invoice.payment_succeeded` só nas renovações.
- **Cancelar agenda o fim para o fim do período já pago**
  (`cancel_at_period_end`). O status fica `canceling` e dá para retomar.
- **Reembolso em até 7 dias** (CDC Art. 49) encerra o plano na hora e remove os
  créditos daquela cobrança.
- **Não existe assinatura em dobro.** Quem já assina recebe 409 no checkout, e
  a sessão de checkout anterior é expirada antes de abrir outra. Trocar de
  plano (upgrade/downgrade) ainda não está implementado.
- **Excluir a conta cancela a assinatura antes**, e as cobranças ficam
  guardadas sem vínculo com a pessoa (obrigação fiscal).

Cotas e Price IDs por plano: `backend/src/payments/plan.config.ts`.
A arquitetura completa está em `docs/PAYMENT_ARCHITECTURE.md`.

## LGPD

- `GET /user/me/export`: o titular baixa os próprios dados (Configurações →
  Privacidade).
- `DELETE /user/me`: o titular exclui a conta com a senha.
- Banner de cookies com "Recusar" do mesmo peso que "Aceitar". Analytics só
  roda com consentimento, e dá para revogar em `/politica-de-cookies`.

## Ao começar um projeto novo

1. `frontend/libs/siteConfig.ts`: nome, descrição, e-mails e keywords. É o
   único lugar com a marca, e nenhum componente tem o nome cravado.
2. `APP_NAME` no `backend/.env`: nome que aparece nos e-mails.
3. `frontend/public/Logo.png` e `frontend/app/favicon.ico`.
4. `frontend/components/hero`, `features`, `marqueeLandingPage` e
   `ctaLandingPage`: o texto está em constantes no topo de cada arquivo.
5. `frontend/components/pricing`: nomes, preços e features dos planos. Os ids
   `FREE`/`STANDARD`/`PRO` precisam bater com o enum `Plan` do backend.
6. Páginas legais (`/termos-de-uso`, `/politica-de-privacidade`,
   `/politica-de-cookies`) são um rascunho genérico. Revise antes de publicar.

## Rotas protegidas

`frontend/proxy.ts` é fail-closed: tudo que não está em `publicRoutes` exige
sessão. Rotas sob `/admin` exigem `role: "ADMIN"`. O proxy é só a primeira
camada: os guards do backend continuam sendo a autoridade.

## Testes

```bash
cd backend
npm test            # unitários
npm run test:e2e    # e2e contra Postgres em memória (PGlite), sem Docker
npm run lint:check
```

O CI (`.github/workflows/ci.yml`) roda lint, build e testes do backend, lint e
build do frontend, e o build das imagens Docker.

Deploy em produção: [docs/DEPLOY.md](docs/DEPLOY.md).
