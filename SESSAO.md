# Sessão — 12/08/2026

## Parte 1 — Frontend virou boilerplate genérico

Transformação do frontend (projeto "LiveMotion", geração de vídeo com IA) em
boilerplate de SaaS, e unificação dos dois repos em um só.

### Estrutura do repositório

- `frontend/.git` e `backend/.git` movidos para
  `~/projects/.saas-start-nested-git-backup/` — sem eles, o `saas-start` vira
  um repo único clonável em vez de dois gitlinks quebrados.
- `.gitignore` na raiz cobrindo `node_modules`, `.next`, `dist`,
  `backend/generated`, `.env` (com exceção para `.env.example`).
- `frontend/.env.example` criado (não existia).
- `README.md` na raiz com setup dos dois lados, seção de Stripe e o checklist
  de "o que trocar ao começar um projeto novo".

### Removido (específico do projeto de vídeo)

`services/dashboard` (compositions/SSE), `components/dashboard/{miniPromptBox,
myVideosSession, newVideoCard, videoCard, videoModal}`, `components/{promptBox,
promptShowCase, motionDecor, carouselLaningPage}`, o stub vazio
`app/(public)/landingpage.tsx`, os SVGs padrão do create-next-app, a dependência
`@microsoft/fetch-event-source` e 11 `@keyframes` órfãos do `globals.css`.

### Mantido e genericizado

- **`libs/siteConfig.ts`** virou o ponto único de marca. Nenhum componente tem
  mais o nome do produto cravado.
- **Landing page**: Header → Hero → Marquee → Features → Pricing → CTA → Footer.
  `features` é novo (substitui o carrossel de vídeos e o showcase de prompts).
- **Auth completo**, **pagamento** (contrato Stripe intacto), **dashboard**
  reescrito como visão geral genérica, **páginas legais** e **/settings**.

## Parte 2 — Backend: `/user/profile` e módulo de pagamentos

Implementado seguindo `docs/PAYMENT_ARCHITECTURE.md`.

### Banco

Migration aditiva `20260812120000_billing`: `name`, `plan`, `credits`,
`subscriptionStatus`, `stripeCustomerId` e `stripeSubscriptionId` no `User`
(os dois últimos `unique`), mais a tabela `Payment` com `stripeInvoiceId`
unique — a chave de idempotência que impede reentrega duplicar fatura.

**Não foi aplicada em nenhum banco seu** (ver PENDENCIAS 3).

### Rotas novas

| Rota | Proteção |
|---|---|
| `GET /user/profile` | AuthGuard (sem exigir e-mail confirmado) |
| `PATCH /user/profile` | AuthGuard + VerifiedEmailGuard |
| `PATCH /user/password` | AuthGuard + VerifiedEmailGuard |
| `POST /payments/checkout` | AuthGuard + VerifiedEmailGuard |
| `POST /payments/cancel` | AuthGuard + VerifiedEmailGuard |
| `GET /payments/user` | AuthGuard + VerifiedEmailGuard (id vem do token) |
| `GET /payments/user/:userId` | AuthGuard + ADMIN |
| `GET /payments` | AuthGuard + ADMIN |
| `DELETE /payments/:id` | AuthGuard + ADMIN |
| `POST /payments/webhook` | público, validado por assinatura |

`GET /user/profile` **não** exige e-mail confirmado de propósito: é essa
resposta (`isVerified`) que o frontend usa para exibir o aviso de confirmação
pendente. Exigir ali tornaria o aviso impossível de mostrar.

### Decisões que vale registrar

- **Separação em três camadas** como manda o doc: `PaymentsController` (HTTP),
  `PaymentsService` (Stripe + regra dos webhooks), `PaymentRecordService` (CRUD
  puro, não importa o SDK da Stripe). Trocar de gateway mexe só no do meio.
- **Stripe é opcional, mas tudo-ou-nada.** Sem `STRIPE_SECRET_KEY` a app sobe e
  `/payments` responde 503. Com o grupo pela metade, o boot quebra. O doc pede
  "falhar no boot"; um boilerplate precisa rodar sem Stripe. Essa foi a forma
  de atender os dois: o estado perigoso (meia configuração, que aceita checkout
  e nunca libera o plano) é o único proibido.
- **`VerifiedEmailGuard` novo**, separado do flag global
  `REQUIRE_EMAIL_VERIFICATION`. Aquele flag existe para desenvolver sem SMTP e
  afrouxa o login inteiro; rota que movimenta dinheiro não pode depender de um
  flag de conveniência.
- **Versão da API da Stripe fixada** (`2026-07-29.dahlia`) em vez de seguir a
  conta.
- **`/users` → `/user`** para bater com o frontend e o `API_ROUTES.md`
  (breaking change, ver PENDENCIAS 5).

### Correções de bug encontradas no caminho

Frontend:
1. **Gate de admin não funcionava.** O proxy comparava a role com `"admin"`
   minúsculo; o backend emite o enum do Prisma em maiúsculo (`ADMIN`).
2. **Token válido sem claim `role` era tratado como não autenticado.**
3. **Proxy tinha rotas de outro projeto** (`/busca/`, `/produto/`, `/sala`) que
   deixavam passar sem autenticação.
4. **Sessão inválida não limpava o cookie** — loop de redirect para `/login`.
5. **`sideBarProfile` refazia o `getProfile()`** ignorando a prop que já
   recebia (com `@ts-ignore`).
6. **`emailVerifyPopup`**: dois erros de `react-hooks` (setState síncrono em
   effect). Trocado o padrão `mounted` por `useSyncExternalStore`.
7. **CTA da landing capturava e-mail e não mandava a lugar nenhum.** Virou link
   para `/register`.
8. `console.log` de token e ~60 linhas comentadas removidas de `libs/api.ts`.

Backend:
9. **`PaymentsModule` não resolvia o `AuthGuard`**: `CaslModule` não é global e
   faltava no `imports`. O boot da app inteira quebrava — e como o erro
   acontecia antes do `close()`, o socket do PGlite ficava aberto e a suíte e2e
   **travava sem imprimir nada** em vez de falhar. Foi o que mais custou a
   achar.

Contrato frontend↔backend:
10. `UserProfile.name` era `string`, mas o cadastro não exige nome — virou
    `string | null`.
11. `AuthResponse` declarava `refreshToken` no corpo do login. Ele nunca veio
    no corpo: é cookie httpOnly, justamente para o JS não conseguir lê-lo.
12. `RegisterLoginDto` não aceitava `name`, mas o frontend manda no cadastro.
    Com `forbidNonWhitelisted`, todo register respondia **400**.
13. `API_ROUTES.md` afirmava que **não** havia `ValidationPipe` global e que
    `POST /user` e `GET /user/:id` eram públicas. As três coisas eram falsas.

## Parte 3 — Revisão final: três defeitos que impediam o clone de funcionar

Ao revisar se restava algo, apareceram problemas que nenhum teste pegava porque
ninguém tinha rodado as duas pontas juntas.

### 1. A área logada estava quebrada incondicionalmente

O backend assina o cookie `refreshToken` com `JWT_REFRESH_SECRET`
(`SECRET_ENV` em `token.service.ts`), mas o `proxy.ts` validava esse cookie com
`JWT_SECRET`. Como o `validateEnv` do backend **recusa secrets repetidos**, não
existia configuração em que isso funcionasse: login → cookie → `/dashboard` →
assinatura reprovada → volta para `/login`, em loop.

Corrigido em `libs/auth.ts` (usa `JWT_REFRESH_SECRET`, fixa `algorithms:
["HS256"]` e confere o claim `typ === "refresh"`). Verificado assinando um
token igual ao do backend: com `JWT_SECRET` dá
`ERR_JWS_SIGNATURE_VERIFICATION_FAILED`; com o de refresh, passa.

### 2. Confirmação de e-mail não tinha para onde ir

O backend manda `${FRONTEND_URL}/confirm?token=...`, e essa rota não existia —
o link dava 404. `confirmEmail()` estava em `services/user` como código morto.

Criada a página `/confirm` e adicionada a `publicRoutes` do proxy. Esse segundo
passo importa tanto quanto o primeiro: o proxy é fail-closed, então sem
declarar a rota o link seria redirecionado para `/login` mesmo com a página
existindo. Entra como `whenAuthenticated: "next"` porque o caso comum é o
usuário já estar logado e sem e-mail confirmado.

### 3. Portas conflitantes nos exemplos

`backend/.env.example` trazia `PORT=3000` e o frontend apontava
`NEXT_PUBLIC_BACKEND_URL` para a 3000 — mas o `next dev` também usa a 3000.
Seguindo o README, os dois brigavam pela mesma porta. E `FRONTEND_URL` estava
em `http://localhost:5173` (default do Vite, herdado do boilerplate original),
então os links de e-mail apontariam para lugar nenhum.

Backend na 8080 (a porta que o `API_ROUTES.md` já documentava), frontend na
3000, `FRONTEND_URL` batendo com o frontend.

## Verificação

| Suíte | Resultado |
|---|---|
| backend `npm test` (unitário) | 185 passando, 17 suítes |
| backend `npm run test:e2e` | 79 passando, 3 suítes |
| backend `npm run lint:check` | limpo |
| frontend `npm run build` | 19 rotas |
| frontend `npm run lint` | limpo |
| frontend `tsc --noEmit` | limpo |

`tsc --noEmit` do backend acusa só um erro pré-existente em
`test/setup/test-app.ts` (import dinâmico que o jest resolve em runtime).

Nenhuma chamada real à Stripe foi feita — ver PENDENCIAS 7.

## O que ficou pendente

Tudo em `PENDENCIAS.md`. Os dois que importam:

- **Push não foi feito.** Sua chave SSH tem passphrase e não há `ssh-agent`
  nesta sessão, então nenhum comando meu consegue destravá-la. Rode
  `! git push -u origin feat/saas-boilerplate` na sessão que o prompt aparece.
- **A migration não foi aplicada** em nenhum banco seu.
