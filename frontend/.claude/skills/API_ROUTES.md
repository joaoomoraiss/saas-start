---
name: API_ROUTES
description: Use SEMPRE que for construir, integrar ou debugar o FRONTEND, ou quando precisar saber qual rota chamar, o formato exato do request (body/params) ou o shape da response de qualquer endpoint do backend NestJS. Mapa das rotas da API e de como o frontend chega nelas (BFF em /api).
---

# Mapa da API (contrato Frontend ↔ Backend)

> Fonte de verdade das rotas. Shapes extraídos dos controllers, services e do
> `schema.prisma`. Se divergir do código, o código vence — corrija este arquivo.

---

## 0. Como o frontend chama a API (LEIA PRIMEIRO)

**O browser nunca fala direto com o backend.** Tudo passa pelas rotas `/api/*`
do próprio Next (BFF):

| Chamada no browser | Vira no backend |
|---|---|
| `api.get("/user/profile")` (axios de `libs/api.ts`, baseURL `/api`) | `GET {BACKEND_URL}/user/profile` |
| `POST /api/auth/login` | handler próprio: grava cookies `accessToken` + `refreshToken` (httpOnly) |
| `POST /api/auth/logout` | handler próprio: revoga a sessão e apaga os cookies |
| `GET /api/auth/session` | handler próprio: `{ authenticated, role }` |
| `/api/<qualquer rota>` | `app/api/[...path]/route.ts` repassa com `Authorization: Bearer`, `X-Service-Token` e `X-Client-IP` |

Consequências:

- **Nenhum token chega ao JavaScript.** Não guarde token, não mande
  `Authorization` do client, não use `withCredentials`.
- O BFF renova a sessão sozinho quando o access token expira.
- Quando o backend recusa a sessão, a resposta vem com o header
  `x-session-expired: 1` e o interceptor de `libs/api.ts` manda para `/login`.
  Um 401 sem esse header (ex.: "senha atual incorreta") **não** desloga.
- `/api/auth/refresh-token` e `/api/payments/webhook` são bloqueadas no BFF (404).
- Rotas novas do backend ficam disponíveis em `/api/...` sem código extra.

### Backend

| Item | Valor |
|---|---|
| **Base URL (dev)** | `http://localhost:8080` (`BACKEND_URL` no front) |
| **Prefixo global** | nenhum (no backend; o `/api` é do Next) |
| **Validação** | `ValidationPipe` global com `whitelist` + `forbidNonWhitelisted`: campo inválido **ou não declarado** no DTO → **400** |
| **Rate limit** | global 120 req/min por IP; rotas sensíveis mais apertadas (tabela no §6). Excedeu → **429** |

### Guards

| Guard | Efeito |
|---|---|
| `AuthGuard` | access token válido. Sem ele → **401**. Role lida do banco, não do token. |
| `VerifiedEmailGuard` | `isVerified: true`. Senão → **403 "Email not verified"**. Vale mesmo com `REQUIRE_EMAIL_VERIFICATION=false`. |
| `RoleGuard` + `@RequiredRoles('ADMIN')` | papel ADMIN. Senão → **403**. |
| `PoliciesGuard` (CASL) | dono do registro ou ADMIN. Senão → **403**. |
| `ServiceTokenGuard` | só o servidor Next (header `X-Service-Token`). Senão → **401**. |

### Shapes

**UserProfile** (`GET /user/profile`):
```ts
{
  name: string | null;
  email: string;
  plan: "FREE" | "STANDARD" | "PRO";
  credits: number;
  subscriptionStatus: "active" | "past_due" | "canceling" | "canceled" | null;
  isVerified: boolean;
}
```
`canceling` = cancelamento agendado; o plano pago vale até o fim do período.

**User** (rotas de admin). Nunca traz `password`:
```ts
{
  id: string; name: string | null; email: string; role: "USER" | "ADMIN";
  isVerified: boolean; plan: "FREE" | "STANDARD" | "PRO"; credits: number;
  subscriptionStatus: string | null;
  stripeCustomerId: string | null; stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  createdAt: string; updatedAt: string;
}
```

**Payment**:
```ts
{
  id: string;
  userId: string | null;             // null só em registros de contas excluídas
  plan: "FREE" | "STANDARD" | "PRO"; // plano naquela cobrança
  amount: number;                    // ⚠️ CENTAVOS (1990 = R$ 19,90)
  currency: string;                  // "brl"
  status: "PAID" | "FAILED" | "REFUNDED";
  stripeInvoiceId: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  hostedInvoiceUrl: string | null;   // recibo na Stripe
  invoicePdfUrl: string | null;      // PDF
  paidAt: string; createdAt: string; updatedAt: string;
}
```

**Erro** (padrão NestJS): `{ statusCode: number; message: string | string[]; error?: string }`

---

## 1. Health

### `GET /health`
- Público, fora do rate limit.
- **200** `{ "status": "ok" }` · **503** se o banco não responde.

---

## 2. Auth — `/auth` (públicas)

### `POST /auth/register` · limite 10/hora
- **Body:** `{ email: string; password: string; name?: string; captchaToken?: string }`
  - `password`: senha forte (validador `IsStrongPassword`).
  - `captchaToken`: token do Cloudflare Turnstile. Exigido quando o backend
    tem `TURNSTILE_SECRET_KEY` (componente `components/turnstile`, action
    `"register"`). O token é de uso único: depois de um erro, gere outro.
- **201** `{ id: string; email: string }`. Não loga. Dispara e-mail de confirmação.
- **Erros:** `400` validação ou `"Captcha verification failed"` · `422` e-mail já existe.

### `POST /auth/login` · limite 10/min
- No front: **`POST /api/auth/login`** (grava os cookies).
- **Body:** `{ email: string; password: string }`
- **200** no BFF: `{ ok: true }`. No backend: `{ token }` + cookie `refreshToken`.
- **Erros:** `401 "Invalid credentials"` · `401 "Email not verified"` (se `REQUIRE_EMAIL_VERIFICATION=true`) · `429`.

### `POST /auth/confirm` · limite 10/hora
- **Body:** `{ token: string }` (do link `/confirm?token=`)
- **204** · **401** token inválido/expirado · **404** usuário não existe.

### `POST /auth/verify-email` · limite 5/hora
- Reenvia a confirmação. **Body:** `{ email: string }`
- **202** sempre (não revela se a conta existe).

### `POST /auth/forgot-password` · limite 5/hora
- **Body:** `{ email: string }` · **202** sempre.

### `POST /auth/reset-password` · limite 10/hora
- **Body:** `{ token: string; newPassword: string }`
- **204**. O link é de **uso único** e **derruba todas as sessões** do usuário.
- **Erros:** `400` senha fraca · `401` token inválido, expirado ou já usado.

### `POST /auth/refresh-token` · limite 60/min
- **Uso interno do BFF.** Bloqueada em `/api` (404).
- Rotaciona a sessão: o refresh antigo é revogado. Reapresentar um refresh já
  rotacionado depois de 30 s derruba todas as sessões (detecção de roubo).

### `POST /auth/logout`
- No front: **`POST /api/auth/logout`**. **204**. Revoga a sessão no banco.

---

## 3. User — `/user` (todas com `AuthGuard`)

### `GET /user/profile`
- Sem exigir e-mail confirmado (o front usa `isVerified` para o aviso).
- **200** `UserProfile`.

### `PATCH /user/profile` · + `VerifiedEmailGuard`
- **Body:** `{ name?: string }` (id vem do token) · **200** `UserProfile`.

### `PATCH /user/password` · + `VerifiedEmailGuard` · limite 5/hora
- **Body:** `{ currentPassword: string; newPassword: string }`
- **200** `{ message: "Password updated" }`. Derruba as **outras** sessões; a atual continua.
- **Erros:** `401 "Current password is incorrect"` (não desloga) · `400` senha fraca · `403`.

### `GET /user/me/export` · limite 10/hora
- LGPD. Sem exigir e-mail confirmado. Responde com `Content-Disposition: attachment`.
- No front: link `href="/api/user/me/export"` (constante `EXPORT_DATA_URL`).
- **200**:
  ```ts
  {
    exportedAt: string;
    account: { id, email, name, role, isVerified, plan, credits, subscriptionStatus, createdAt, updatedAt };
    payments: { plan, amount, currency, status, paidAt, hostedInvoiceUrl, invoicePdfUrl }[];
    sessions: { createdAt, expiresAt, revokedAt, revokedReason }[];
  }
  ```

### `DELETE /user/me` · limite 5/hora
- LGPD. **Body:** `{ password: string }`
- **204**. Cancela a assinatura na Stripe **antes**, apaga a conta e as
  sessões. Cobranças ficam com `userId: null`.
- **Erros:** `401 "Password is incorrect"` · `503` Stripe indisponível (nada é apagado).
- Depois do sucesso, chame `signOut()` para limpar os cookies do navegador.

### Admin

| Método | Rota | Proteção | Body | Response |
|---|---|---|---|---|
| POST | `/user` | ADMIN | `{ email, password, name? }` | User |
| GET | `/user` | ADMIN | — | User[] |
| GET | `/user/:id` | dono ou ADMIN (CASL) | — | User |
| PATCH | `/user/:id` | dono ou ADMIN (CASL) | `{ password? }` | User. Com senha, derruba as sessões |
| DELETE | `/user/:id` | ADMIN | — | User. Cancela a assinatura antes |

---

## 4. Payments — `/payments` (Stripe)

Sem Stripe configurada no backend, as rotas que falam com a Stripe respondem **503**.

| Plano | Checkout | Créditos por cobrança |
|---|---|---|
| `FREE` | não | 0 |
| `STANDARD` | mensal | 100 |
| `PRO` | mensal | 500 |

Fonte: `backend/src/payments/plan.config.ts`.

### `POST /payments/checkout` · `AuthGuard` + `VerifiedEmailGuard` · limite 10/hora
- **Body:** `{ plan: "STANDARD" | "PRO" }`
- **200** `{ url }`. Redirecione o navegador.
- **Erros:**
  - `400` plano `FREE` ou inválido;
  - `409` já tem assinatura (`active`, `past_due` ou `canceling`), **ou** um checkout anterior já pago ainda não foi processado;
  - `403` e-mail não confirmado.
- Checkout anterior ainda aberto é expirado automaticamente.
- Retorno: `/success?session_id=...` ou `/plans`. A liberação vem pelo
  **webhook**: na `/success`, faça polling em `GET /user/profile`.

### `POST /payments/cancel` · limite 10/hora
- Agenda o fim para o **fim do período já pago**. Status → `canceling`, plano continua.
- **200** `{ message }` · **400** sem assinatura ou já agendado.

### `POST /payments/resume` · limite 10/hora
- Desfaz o cancelamento agendado. Status → `active`.
- **200** `{ message }` · **400** se não há cancelamento agendado.

### `POST /payments/refund` · limite 5/hora
- Direito de arrependimento (CDC Art. 49): reembolso integral da última
  cobrança paga, se feita há até **7 dias**. Encerra o plano **na hora** e
  remove os créditos daquela cobrança.
- **200** `Payment` (status `REFUNDED`).
- **Erros:** `400` sem cobrança na janela · `422` cobrança original não localizada.

### `GET /payments/user` · `AuthGuard` + `VerifiedEmailGuard`
- **200** `Payment[]` do usuário do token, `paidAt desc`.

### Admin

| Método | Rota | Response |
|---|---|---|
| GET | `/payments/user/:userId` | Payment[] |
| GET | `/payments` | Payment[] |
| DELETE | `/payments/:id` | Payment · `404` se não existe |

### `POST /payments/webhook`: só a Stripe chama
- Assinatura em `stripe-signature` + raw body. Fora do rate limit. Bloqueada no BFF.

| Evento | Efeito |
|---|---|
| `checkout.session.completed` | ativa a assinatura e soma os créditos (idempotente) |
| `invoice.payment_succeeded` | grava o `Payment`; na renovação (`subscription_cycle`) soma créditos |
| `invoice.payment_failed` | `past_due` (sem rebaixar) |
| `customer.subscription.updated` | sincroniza `canceling` / `active` / `past_due` |
| `customer.subscription.deleted` | `canceled` + `FREE` |

---

## 5. Contato

### `POST /contact` · `ServiceTokenGuard` · limite 5/hora
- Só via BFF (`/api/contact`). Chamada direta ao backend → 401.
- **Body:** `{ name: string (2–80); email: string; message: string (10–5000) }`
- **202** `{ sent: true }`. Envia para `CONTACT_EMAIL` com resposta para o e-mail informado.
- **Erros:** `400` validação · `429` · `503` sem `CONTACT_EMAIL` ou Resend indisponível.

---

## 6. Resumo

| Método | Rota (backend) | Auth | Limite |
|---|---|---|---|
| GET | `/health` | — | sem limite |
| POST | `/auth/register` | — (+ captcha) | 10/h |
| POST | `/auth/login` | — | 10/min |
| POST | `/auth/confirm` | — | 10/h |
| POST | `/auth/verify-email` | — | 5/h |
| POST | `/auth/forgot-password` | — | 5/h |
| POST | `/auth/reset-password` | — | 10/h |
| POST | `/auth/refresh-token` | cookie (só BFF) | 60/min |
| POST | `/auth/logout` | cookie | global |
| GET | `/user/profile` | login | global |
| PATCH | `/user/profile` | login + verificado | global |
| PATCH | `/user/password` | login + verificado | 5/h |
| GET | `/user/me/export` | login | 10/h |
| DELETE | `/user/me` | login + senha | 5/h |
| POST | `/payments/checkout` | login + verificado | 10/h |
| POST | `/payments/cancel` | login + verificado | 10/h |
| POST | `/payments/resume` | login + verificado | 10/h |
| POST | `/payments/refund` | login + verificado | 5/h |
| GET | `/payments/user` | login + verificado | global |
| POST | `/contact` | SERVICE_TOKEN | 5/h |
| POST | `/payments/webhook` | assinatura Stripe | sem limite |

---

## 7. Armadilhas

- **Não chame o backend direto do browser.** Use `libs/api.ts` (baseURL `/api`).
- **Nada de trailing slash** (`auth/register/`): o Next redireciona e o POST se perde.
- `sendEmailVerification` e `forgot-password` respondem **202**, não 200.
- Status `canceling` ainda é plano pago: não trate como cancelado.
- `amount` em centavos.
- Mensagens de erro do backend estão em inglês: traduza por status na UI.
