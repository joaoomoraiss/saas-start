---
name: API_ROUTES
description: Use SEMPRE que for construir, integrar ou debugar o FRONTEND, ou quando precisar saber qual rota chamar, o formato exato do request (body/params/headers) ou o shape da response de qualquer endpoint do backend NestJS. Mapa completo e fiel de TODAS as rotas da API.
---

# Mapa da API (contrato Frontend ↔ Backend)

> **Para o agente de frontend:** este arquivo é a fonte de verdade das rotas. Cada endpoint
> abaixo traz: método, path, guards (auth necessária), request (params/body/headers) e o shape
> exato da response. Os shapes foram extraídos direto dos controllers, services e do
> `schema.prisma` — confie neles.

---

## 0. Convenções globais (LEIA PRIMEIRO)

| Item | Valor |
|---|---|
| **Base URL (dev)** | `http://localhost:8080` (`.env` define `PORT=8080`; se ausente, o Nest cai em `3000`) |
| **Base URL (prod)** | domínio de produção |
| **Prefixo global** | ❌ **Nenhum** — as rotas ficam na raiz (NÃO existe `/api`) |
| **CORS** | `origin: FRONTEND_URL` (env), `credentials: true` |
| **Headers permitidos** | `Content-Type`, `Authorization` |
| **Métodos permitidos** | GET, POST, PUT, PATCH, DELETE, OPTIONS |

### Autenticação
- O backend lê o token **do header** `Authorization: Bearer <accessToken>`.
  ⚠️ Apesar de o login também gravar um cookie `refreshToken`, **as rotas protegidas NÃO leem o
  cookie** — você precisa mandar o `accessToken` no header em toda requisição autenticada.
- `accessToken` (chamado `token` nas responses) expira conforme `ACCESS_TOKEN_TTL` (default **15m**).
- `refreshToken` expira conforme `REFRESH_TOKEN_TTL_DAYS` (default **30 dias**) e é gravado como cookie `httpOnly` (você não consegue lê-lo
  via JS; ele é reenviado automaticamente para `POST /auth/refresh-token` por causa do `credentials`).
- **Faça `fetch`/`axios` com `credentials: 'include'` / `withCredentials: true`** para o cookie ir/voltar.

### Guards (o que cada rota exige)
| Guard | Significado para o frontend |
|---|---|
| `AuthGuard` | Precisa de `Authorization: Bearer <token>` válido. Sem ele → **401**. |
| `VerifiedEmailGuard` | Precisa que o usuário tenha `isVerified: true` (email confirmado). Senão → **403 "Email not verified"**. Vale mesmo com `REQUIRE_EMAIL_VERIFICATION=false`. |
| `RoleGuard` + `@RequiredRoles(...)` | Precisa de role específica (ex.: `ADMIN`). Senão → **403**. |

### ⚠️ Validação de input (importante)
Há um `ValidationPipe` global (`src/app.setup.ts`) com `whitelist`, `forbidNonWhitelisted` e
`transform`. Na prática:
- os decorators `class-validator` dos DTOs **são** aplicados em runtime — payload inválido volta **400**;
- mandar um campo que o DTO não declara **também** dá 400 (não é ignorado silenciosamente).

Continue validando no cliente para dar feedback rápido, mas o servidor é a garantia.

### Shapes base dos models (referência das responses)

**User** (retornado cru em algumas rotas). O hash de senha é omitido no nível do client
Prisma, então **não** vem nessas responses:
```ts
{
  id: string;            // uuid
  name: string | null;   // opcional no cadastro
  email: string;
  role: "USER" | "ADMIN";
  isVerified: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: string | null;   // "active" | "canceled" | "past_due" | null
  plan: "FREE" | "STANDARD" | "PRO";
  credits: number;       // default 0 (todo novo usuário começa sem créditos)
  createdAt: string;     // ISO date
  updatedAt: string;     // ISO date
}
```

**Payment** (histórico de cobranças — uma linha por fatura paga na Stripe):
```ts
{
  id: string;                        // uuid
  userId: string;
  plan: "FREE" | "STANDARD" | "PRO"; // plano pago naquela cobrança
  amount: number;                    // ⚠️ em CENTAVOS (ex.: 1990 = R$ 19,90)
  currency: string;                  // ex.: "brl"
  status: "PAID" | "FAILED" | "REFUNDED";
  stripeInvoiceId: string;           // id da invoice na Stripe (único)
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  hostedInvoiceUrl: string | null;   // 🧾 RECIBO (página Stripe): https://invoice.stripe.com/i/...
  invoicePdfUrl: string | null;      // 🧾 PDF da fatura para download
  paidAt: string;                    // ISO date — quando a fatura foi paga
  createdAt: string;                 // ISO date
  updatedAt: string;                 // ISO date
}
```
> 🧾 **Recibo:** abra `hostedInvoiceUrl` num link/botão "ver recibo" e `invoicePdfUrl` num "baixar PDF".
> `amount` vem em centavos — divida por 100 para exibir (`(amount/100).toLocaleString('pt-BR', {style:'currency', currency})`).

### Shape de erro (padrão NestJS)
```ts
{ statusCode: number; message: string | string[]; error?: string }
```

---

## 1. App / Health

### `GET /`
- **Guards:** nenhum (público)
- **Request:** —
- **Response 200:** `"Hello World!"` (texto puro, não JSON)

---

## 2. Auth — `/auth` (todas públicas, sem guard)

### `POST /auth/register`
Cria o usuário e dispara o email de confirmação. **Não loga** nem retorna token.
- **Body:**
  ```ts
  { name: string; email: string; password: string }  // password mínimo 6 chars (contrato)
  ```
- **Response 201:** corpo vazio (a função não retorna nada). Trate sucesso como "email enviado".
- **Erros:** `422` se email já existe (`"User with this email already exists"`).

### `POST /auth/login`
- **Body:**
  ```ts
  { email: string; password: string }
  ```
- **Efeito colateral:** grava cookie `refreshToken` (httpOnly).
- **Response 200:**
  ```ts
  { token: string; refreshToken: string }   // token = accessToken (7d); guarde-o e mande no header
  ```
- **Erros:** lança `"Invalid credentials"` (vira **500** genérico, pois é `new Error`, não exceção HTTP) quando email não existe ou senha errada.

### `POST /auth/confirm`
Confirma o email a partir do token recebido no link enviado por email.
- **Body:** `{ token: string }`
- **Response 201:** corpo vazio (apenas marca `isVerified = true`).
- **Erros:** `401` token inválido/expirado; `404` usuário não encontrado.

### `POST /auth/verify-email`
Reenvia o email de confirmação.
- **Body:** `{ email: string }`
- **Response 200:** corpo vazio.
- **Erros:** `404` usuário não encontrado; erro se já verificado (`UserAlreadyVerifiedException`).

### `POST /auth/forgot-password`
Dispara email com link de reset.
- **Body:** `{ email: string }`
- **Response 201:** corpo vazio.
- **Erros:** `404` usuário não encontrado.

### `POST /auth/reset-password`
- **Body:** `{ token: string; newPassword: string }`
- **Response 200:** corpo vazio.
- **Erros:** `401` token inválido/expirado; `404` usuário não encontrado.

### `POST /auth/refresh-token`
Usa o cookie `refreshToken` (mande `credentials: 'include'`). Não precisa de body.
- **Request:** sem body; depende do cookie `refreshToken`.
- **Efeito colateral:** regrava o cookie `refreshToken`.
- **Response 200:**
  ```ts
  { token: string; refreshToken: string }   // novo accessToken
  ```
- **Erros:** `401` se cookie ausente/inválido ou usuário não existe.

### `POST /auth/logout`
- **Request:** sem body.
- **Efeito colateral:** limpa o cookie `refreshToken`.
- **Response 200:** `{ message: "Logged out successfully" }`

## 3. User — `/user`

### `POST /user` — criar usuário (AuthGuard + ADMIN)
> Prefira `POST /auth/register` no fluxo normal (este não dispara email de confirmação).
- **Body** (`CreateUserDto`):
  ```ts
  { email: string; password: string; name?: string }
  ```
  ⚠️ `role` **não** é aceito: promover a ADMIN é estado de segurança, não campo de formulário.
  Mandá-lo dá 400 (`forbidNonWhitelisted`).
- **Response 201:** objeto **User** (a role sai sempre como `"USER"`).
- **Erros:** `422` se email já existe.

### `GET /user/profile` — perfil do usuário logado ⭐
- **Guards:** `AuthGuard` (apenas login; **não** exige email verificado).
- **Request:** `Authorization: Bearer <token>`.
- **Response 200** (shape enxuto e seguro — sem password):
  ```ts
  {
    name: string | null;
    email: string;
    plan: "FREE" | "STANDARD" | "PRO";
    credits: number;
    subscriptionStatus: string | null;  // "active" | "past_due" | "canceled" | null
    isVerified: boolean;
  }
  ```
- **Use esta** para header/avatar, saldo de créditos, plano atual, status da assinatura e flag de verificação.
- **Erros:** `401` sem token; `404` usuário não encontrado.

### `PATCH /user/profile` — editar o PRÓPRIO perfil ⭐
- **Guards:** `AuthGuard` + `VerifiedEmailGuard` (login + email verificado).
- **Request:** `Authorization: Bearer <token>`. O id do usuário vem **do token**, NÃO do corpo nem da URL.
- **Body** (`UpdateProfileDto`): `{ name?: string }` — hoje só `name` é editável (por segurança, não dá
  para alterar `role`/`isVerified`/`email` por aqui).
- **Response 200:** o profile enxuto atualizado (mesmo shape do `GET /user/profile`, sem `password`).
- **Erros:** `401` sem token; `403` email não verificado; `404` usuário não encontrado.
- **Use esta** para a tela "editar perfil" do usuário. ✅ É o jeito certo de deixar o usuário mudar o
  nome — o frontend manda só `{ name }`, sem precisar saber o próprio id.

### `PATCH /user/password` — trocar a PRÓPRIA senha 🔒
- **Guards:** `AuthGuard` + `VerifiedEmailGuard` (login + email verificado).
- **Request:** `Authorization: Bearer <token>`. O id vem **do token** — o usuário só troca a própria senha.
- **Body** (`ChangePasswordDto`):
  ```ts
  { currentPassword: string; newPassword: string }  // newPassword: mínimo 6 chars
  ```
- **Segurança:** exige a **senha atual** (conferida com `bcrypt.compare`) antes de aceitar a nova; a
  nova é salva como **hash bcrypt** (nunca em texto puro). A `newPassword` deve ser diferente da atual.
- **Response 200:** `{ message: "Password updated successfully" }`.
- **Erros:**
  - `401` sem token **ou** senha atual incorreta (`"Current password is incorrect"`).
  - `403` email não verificado.
  - `400` `newPassword` < 6 chars, igual à atual, ou campos ausentes.
  - `404` usuário não encontrado.
- **Frontend:** formulário com "senha atual" + "nova senha" (+ confirmação client-side). Em caso de
  `401 "Current password is incorrect"`, destaque o campo de senha atual.
  > ℹ️ A troca **não** invalida tokens/sessões já emitidos (JWT é stateless). Para forçar logout em
  > outros dispositivos seria preciso versionar tokens — fora do escopo atual.

### `GET /user` — listar todos
- **Guards:** `AuthGuard` + `RoleGuard` + `VerifiedEmailGuard`, `@RequiredRoles(ADMIN, USER)`.
- **Response 200:** `User[]` (objetos completos, ⚠️ incluem `password` hash).

### `GET /user/:id` — buscar por id (AuthGuard + CASL: dono ou ADMIN)
- **Param:** `id` (uuid).
- **Response 200:** objeto **User** completo.
- **Erros:** `404` `"User not found"`.

### `PATCH /user/:id` — atualizar qualquer usuário (somente ADMIN)
- **Guards:** `AuthGuard` + `RoleGuard` + `VerifiedEmailGuard`, `@RequiredRoles(ADMIN)`.
  ⚠️ Mudou: antes aceitava `USER` (um usuário podia editar outro / se promover a ADMIN). Agora é
  **só ADMIN**. Para o usuário editar a si mesmo, use `PATCH /user/profile`.
- **Param:** `id` (uuid).
- **Body** (`UpdateUserDto`, todos opcionais):
  ```ts
  { name?: string; email?: string; password?: string; role?: "USER"|"ADMIN"; isVerified?: boolean }
  ```
  `name`, `password` (re-hash), `email`, `role` e `isVerified` são aplicados pelo service.
- **Response 200:** objeto **User** atualizado.
- **Erros:** `403` se não for admin; `404` se não existir.

### `DELETE /user/:id`
- **Guards:** `AuthGuard` + `RoleGuard` + `VerifiedEmailGuard`, `@RequiredRoles(ADMIN)` (só admin).
- **Param:** `id` (uuid).
- **Response 200:** objeto **User** deletado.
- **Erros:** `404` se não existir.

---

## 4. Payments — `/payments` (Stripe)

### Modelo de planos (assinatura)
| Plano | Cobrança Stripe | Créditos por fatura paga |
|---|---|---|
| `FREE` | ❌ default, não passa por checkout | 0 |
| `STANDARD` | ✅ mensal | 100 |
| `PRO` | ✅ mensal | 400 |

- Créditos **acumulam**: cada fatura paga (assinatura nova ou renovação mensal) **soma** a cota do
  plano ao saldo. Cancelar volta o usuário para `FREE` mas **não zera** os créditos restantes.
- Todo usuário novo nasce `FREE` com `credits: 0`.

> **Auth:** todas as rotas de `/payments` exigem **login + email verificado** (`AuthGuard` +
> `VerifiedEmailGuard`), **exceto** o `webhook` (público, chamado pela Stripe). As rotas de **admin** abaixo
> acrescentam `RoleGuard` + `@RequiredRoles(ADMIN)`.

### `POST /payments/checkout` — assinar / fazer upgrade
- **Guards:** `AuthGuard` + `VerifiedEmailGuard`.
- **Body:** `{ plan: "STANDARD" | "PRO" }`  *(enum `Plan` do Prisma; `FREE` é rejeitado)*
- **Response 200/201:** `{ url: string }` — **redirecione o navegador** para essa URL do Stripe Checkout.
- **Erros:**
  - `400` `'Plan "FREE" does not require checkout'` — FREE não tem cobrança.
  - `400` se o Stripe não retornar URL.
  - `401` sem token.
- **Pós-pagamento:** o Stripe redireciona para `${APP_DOMAIN}/success?session_id=...` (sucesso) ou
  `${APP_DOMAIN}/plans` (cancelado). Crie essas páginas no frontend.
- ⚠️ **A ativação do plano/créditos é assíncrona** (acontece via webhook, **não** na resposta do
  checkout). Na página `/success`, faça **polling** em `GET /user/profile` até `plan`/`credits`
  refletirem a compra.

### `POST /payments/cancel` — cancelar assinatura
- **Guards:** `AuthGuard` + `VerifiedEmailGuard`.
- **Request:** sem body.
- **Efeito:** cancela no Stripe, `subscriptionStatus = "canceled"` e volta para `plan = "FREE"`
  (créditos já acumulados permanecem).
- **Response 200:** `{ message: "Subscription canceled successfully" }`
- **Erros:** `401` sem token; `403` email não verificado; `400` `"User has no active subscription"`.

### `GET /payments/user` — MINHAS cobranças ⭐
- **Guards:** `AuthGuard` + `VerifiedEmailGuard` (qualquer usuário logado + verificado).
- **Request:** `Authorization: Bearer <token>`.
- **Response 200:** `Payment[]` do usuário logado, ordenado por `paidAt desc` (mais recente primeiro).
- **Use esta** para a tela "Histórico de pagamentos / Faturas" do usuário (com link de recibo).

### `GET /payments/user/:userId` — cobranças de um usuário (ADMIN)
- **Guards:** `AuthGuard` + `VerifiedEmailGuard` + `RoleGuard`, `@RequiredRoles(ADMIN)`.
- **Param:** `userId` (uuid).
- **Response 200:** `Payment[]` daquele usuário, `paidAt desc`.
- **Erros:** `403` se não for admin.

### `GET /payments` — todas as cobranças (ADMIN)
- **Guards:** `AuthGuard` + `VerifiedEmailGuard` + `RoleGuard`, `@RequiredRoles(ADMIN)`.
- **Response 200:** `Payment[]` (todas), `paidAt desc`.
- **Erros:** `403` se não for admin.

### `DELETE /payments/:id` — apagar um registro (ADMIN)
- **Guards:** `AuthGuard` + `VerifiedEmailGuard` + `RoleGuard`, `@RequiredRoles(ADMIN)`.
- **Param:** `id` (uuid do Payment).
- **Response 200:** objeto **Payment** removido.
- **Erros:** `403` se não for admin; `404` `"Payment not found"`.

### `POST /payments/webhook` — ⚠️ só Stripe, NÃO chamar do frontend
- Recebe eventos do Stripe (`stripe-signature` header + rawBody). Registrado no dashboard do Stripe.
- Eventos tratados e efeito:
  | Evento | Efeito |
  |---|---|
  | `checkout.session.completed` | grava `plan`, `subscriptionStatus = active`, soma créditos da cota |
  | `invoice.payment_succeeded` | **cria/atualiza um `Payment`** (recibo) e, se `subscription_cycle` (renovação), soma de novo os créditos da cota |
  | `invoice.payment_failed` | `subscriptionStatus = past_due` |
  | `customer.subscription.deleted` | `subscriptionStatus = canceled`, volta para `plan = FREE` |
- Listado aqui só para completude. **O frontend nunca chama isto** — mas é por causa dele que a
  liberação após o checkout é assíncrona (releia `GET /user/profile`).

---

## 6. Resumo rápido (tabela de bolso)

| Método | Rota | Auth | Request | Response |
|---|---|---|---|---|
| GET | `/` | — | — | `"Hello World!"` |
| POST | `/auth/register` | — | `{name,email,password}` | vazio |
| POST | `/auth/login` | — | `{email,password}` | `{token,refreshToken}` + cookie |
| POST | `/auth/confirm` | — | `{token}` | vazio |
| POST | `/auth/verify-email` | — | `{email}` | vazio |
| POST | `/auth/forgot-password` | — | `{email}` | vazio |
| POST | `/auth/reset-password` | — | `{token,newPassword}` | vazio |
| POST | `/auth/refresh-token` | cookie | — | `{token,refreshToken}` |
| POST | `/auth/logout` | — | — | `{message}` |
| POST | `/user` | — | `CreateUserDto` | User |
| GET | `/user/profile` | Bearer | — | `{name,email,plan,credits,subscriptionStatus,isVerified}` |
| PATCH | `/user/profile` | Bearer+verif. | `{name?}` | profile atualizado |
| PATCH | `/user/password` | Bearer+verif. | `{currentPassword,newPassword}` | `{message}` · `401` se senha atual errada |
| GET | `/user` | Bearer+ADMIN/USER+verif. | — | User[] |
| GET | `/user/:id` | — | — | User |
| PATCH | `/user/:id` | Bearer+ADMIN+verif. | `UpdateUserDto` | User |
| DELETE | `/user/:id` | Bearer+ADMIN+verif. | — | User |
| POST | `/payments/checkout` | Bearer+verif. | `{plan: "STANDARD"\|"PRO"}` | `{url}` · `400` se `FREE` |
| POST | `/payments/cancel` | Bearer+verif. | — | `{message}` |
| GET | `/payments/user` | Bearer+verif. | — | Payment[] (minhas) |
| GET | `/payments/user/:userId` | Bearer+verif.+ADMIN | — | Payment[] |
| GET | `/payments` | Bearer+verif.+ADMIN | — | Payment[] |
| DELETE | `/payments/:id` | Bearer+verif.+ADMIN | — | Payment |
| POST | `/payments/webhook` | Stripe | rawBody+sig | `{received:true}` |

---

## 7. Fluxos típicos do frontend

**Cadastro → verificação → uso:**
1. `POST /auth/register` → mostra "confira seu email".
2. Usuário clica no link → sua página chama `POST /auth/confirm` com o `token` da URL.
3. `POST /auth/login` → guarde `token`; mande-o em `Authorization` daí em diante.
4. `GET /user/profile` → header, créditos, `isVerified`.

**Assinatura:**
1. Tela de planos: mostre FREE/STANDARD/PRO (as cotas de cada plano são definidas pelo backend). O plano atual vem de
   `GET /user/profile` (`plan` + `subscriptionStatus`).
2. Botão assinar/upgrade → `POST /payments/checkout` com `{plan: "STANDARD" | "PRO"}` → redirecione
   para `url`. `FREE` não tem checkout (retorna 400).
3. Stripe volta para `/success` (sucesso) ou `/plans` (cancelado). Como a liberação é **assíncrona via
   webhook**, na `/success` faça **polling** em `GET /user/profile` até `plan`/`credits` atualizarem.
4. Cancelar → `POST /payments/cancel` (volta para `FREE`, mantém créditos restantes).
5. **Histórico / recibos:** `GET /payments/user` → lista de `Payment[]`. Para cada um, mostre
   `plan`, `amount/100` formatado em `currency`, `paidAt`, e botões para `hostedInvoiceUrl` (ver
   recibo na Stripe) e `invoicePdfUrl` (baixar PDF). Cada fatura paga (inclusive renovações) vira
   uma linha aqui automaticamente via webhook.

---

## 8. Armadilhas / observações para o frontend

- **Sem prefixo `/api`** — chame as rotas na raiz da base URL.
- **Porta dev = 8080** (via `.env`), não 3000. O frontend dev roda em `:3000` (origin do CORS).
- **`refreshToken` é cookie httpOnly** — não tente lê-lo via JS; use `credentials:'include'` e deixe `/auth/refresh-token` regravá-lo.
- **`login` com credenciais inválidas retorna 500** (não 401), porque o service usa `new Error` cru. Trate erro genérico de login.
- **Várias rotas retornam o `User` cru com `password`** (hash) — nunca renderize esse campo. Para dados de perfil seguros use `GET /user/profile`.
- **`durationInSeconds` (request) ≠ `durationInFrames` (response).** O backend só devolve frames.
