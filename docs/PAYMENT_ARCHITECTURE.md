# Arquitetura de Pagamentos por Assinatura (Stripe) — Guia de Implementação

Documento **agnóstico de framework**. Descreve a arquitetura de um sistema de assinaturas
recorrentes com Stripe Checkout + Webhooks, para ser reimplementado em NestJS, Spring Boot,
FastAPI ou qualquer outro stack.

Não contém regras de negócio específicas de nenhum produto (preços, nomes de planos, cotas).
Onde aparece `PLANO_A` / `PLANO_B`, substitua pelos planos reais do projeto.

---

## 1. Princípios da arquitetura

Cinco regras que definem todo o resto:

1. **O backend nunca processa cartão.** O usuário é redirecionado para uma página hospedada
   pela Stripe (Checkout). Dados de cartão jamais tocam sua aplicação — isso mantém o escopo
   de PCI compliance no mínimo.
2. **O webhook é a única fonte de verdade para liberar acesso.** O retorno do usuário para a
   `success_url` **não** é prova de pagamento (ele pode fechar o navegador, ou forjar a URL).
   Só o evento assinado da Stripe libera o plano.
3. **Estado atual vive no usuário, histórico vive em tabela separada.** O `User` guarda "qual é
   o plano agora"; a tabela `Payment` guarda "o que já foi cobrado" (imutável, append-only).
4. **Todo handler de webhook é idempotente.** A Stripe reentrega eventos em caso de timeout ou
   erro. Processar duas vezes não pode duplicar créditos nem duplicar registros.
5. **Identificadores da Stripe são chaves de correlação.** `customerId`, `subscriptionId` e
   `invoiceId` ficam persistidos no seu banco — é assim que um evento de webhook (que só traz
   IDs da Stripe) encontra o usuário correspondente.

---

## 2. Modelo de dados

### 2.1 Campos adicionados ao `User`

| Campo | Tipo | Papel |
|---|---|---|
| `stripeCustomerId` | string, nullable, **unique** | Cliente na Stripe. Criado no 1º checkout, reutilizado depois. Chave de busca dos webhooks. |
| `stripeSubscriptionId` | string, nullable, **unique** | Assinatura ativa. `null` quando não há assinatura. |
| `subscriptionStatus` | string, nullable | Espelho do status da Stripe: `active`, `past_due`, `canceled`. |
| `plan` | enum | Plano vigente. Tem um valor default gratuito (`FREE`). |
| `credits` | int, default 0 | Cota consumível concedida a cada cobrança paga. **Opcional** — só se o produto for baseado em consumo. |

> **Por que `unique` nos IDs da Stripe:** garante no nível do banco que dois usuários não
> compartilhem o mesmo cliente/assinatura, o que corromperia o roteamento dos webhooks.

### 2.2 Tabela `Payment` (histórico de cobranças)

Uma linha por fatura paga. Nunca é atualizada por ação do usuário — só pelo webhook.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid, PK | |
| `userId` | FK → User, **indexado** | `ON DELETE CASCADE`. |
| `plan` | enum | Plano **no momento da cobrança** — congelado, não segue mudanças futuras do usuário. |
| `amount` | int | Valor em **centavos** (a Stripe trabalha na menor unidade monetária). Nunca use float. |
| `currency` | string | Ex.: `"brl"`, `"usd"`. |
| `status` | enum | `PAID` / `FAILED` / `REFUNDED`. |
| `stripeInvoiceId` | string, **unique** | **Chave de idempotência.** É o que impede duplicação em reentrega. |
| `stripeCustomerId` | string, nullable | Correlação/auditoria. |
| `stripeSubscriptionId` | string, nullable | Correlação/auditoria. |
| `hostedInvoiceUrl` | string, nullable | Link do recibo hospedado pela Stripe (mostrar ao usuário). |
| `invoicePdfUrl` | string, nullable | PDF da fatura para download. |
| `paidAt` | datetime | Momento do pagamento (vem da Stripe, não do seu servidor). |
| `createdAt` / `updatedAt` | datetime | |

> Guardar `hostedInvoiceUrl` e `invoicePdfUrl` evita ter que chamar a API da Stripe toda vez
> que o usuário abre a tela de faturas.

---

## 3. Configuração de planos

Mantenha um **mapa de configuração** em código (não no banco), ligando cada plano do seu enum a:

- a **cota/benefício** concedido por cobrança paga;
- a **chave de variável de ambiente** que contém o Stripe Price ID daquele plano.

```
PLAN_CONFIG = {
  FREE:    { beneficio: 0,  priceEnvKey: null },        // null = não passa por checkout
  PLANO_A: { beneficio: X,  priceEnvKey: "STRIPE_PRICE_ID_A" },
  PLANO_B: { beneficio: Y,  priceEnvKey: "STRIPE_PRICE_ID_B" },
}
```

**Por que o Price ID fica em env e não hardcoded:** os IDs mudam entre ambiente de teste e
produção. O mapa referencia a *chave* da env var; o valor é resolvido em runtime.

Isso também permite o caminho inverso — dado um Price ID vindo de um webhook, descobrir qual
plano é (ver §5.3).

### Variáveis de ambiente necessárias

```
STRIPE_SECRET_KEY=sk_...          # chave secreta da API
STRIPE_WEBHOOK_SECRET=whsec_...   # segredo para validar assinatura do webhook
STRIPE_PRICE_ID_A=price_...       # um por plano pago
STRIPE_PRICE_ID_B=price_...
FRONTEND_URL=https://...          # base para success_url / cancel_url
```

Falhas de configuração devem quebrar o boot da aplicação (leitura tipo `getOrThrow`), não
silenciosamente em produção.

---

## 4. Separação de responsabilidades

Três componentes, com fronteiras claras:

```
┌─────────────────────┐
│ PaymentController   │  HTTP: rotas, guards, validação de assinatura do webhook,
│                     │  roteamento evento → handler. Sem regra de negócio.
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ PaymentService      │  Tudo que fala com a Stripe (checkout, cancelamento,
│                     │  validação de assinatura) + regra de negócio dos webhooks
│                     │  (que campos do User atualizar em cada evento).
└──────────┬──────────┘
           │
┌──────────▼──────────┐
│ PaymentRecordService│  CRUD puro da tabela Payment. NÃO conhece Stripe —
│                     │  recebe dados já normalizados.
└─────────────────────┘
```

> **Regra:** `PaymentRecordService` não importa o SDK da Stripe. Se um dia trocar de gateway,
> só `PaymentService` muda.

O cliente da Stripe é instanciado **uma vez** na inicialização do módulo/serviço (singleton),
com a versão da API **fixada explicitamente**. Fixar a versão evita que uma atualização do
lado da Stripe quebre a aplicação sem aviso.

---

## 5. Fluxos

### 5.1 Criação do Checkout (usuário assina)

```
Cliente                Backend                    Stripe
  │                       │                          │
  │ POST /payments/checkout {plan}                   │
  ├──────────────────────►│                          │
  │                       │ busca User pelo id do token
  │                       │ resolve priceId via PLAN_CONFIG + env
  │                       │ cria Checkout Session ──►│
  │                       │◄──── { url } ────────────│
  │◄─── { url } ──────────│                          │
  │                                                  │
  │ redireciona o browser para a url ───────────────►│
  │                          (usuário paga na Stripe)│
  │◄──── redirect para success_url ──────────────────│
```

Parâmetros da sessão:

| Parâmetro | Valor | Motivo |
|---|---|---|
| `mode` | `subscription` | Cobrança recorrente. Use `payment` para compra única. |
| `line_items` | `[{ price: priceId, quantity: 1 }]` | O preço vem da env, nunca do request do cliente. |
| `success_url` | `{FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}` | Placeholder é substituído pela Stripe. |
| `cancel_url` | `{FRONTEND_URL}/plans` | Para onde volta se desistir. |
| `metadata` | `{ userId, plan }` | **Crítico** — ver abaixo. |
| `customer` **ou** `customer_email` | ID existente, senão o e-mail | Reutiliza o cliente se já houver `stripeCustomerId`; senão a Stripe cria um. |

> **`metadata` é a ponte entre a Stripe e o seu banco.** O webhook `checkout.session.completed`
> não sabe quem é o seu usuário — ele só devolve o que você colocou em `metadata`. Sem isso,
> não há como saber qual conta liberar.

**Segurança:** o cliente envia apenas o *nome do plano*, nunca o Price ID nem o valor. O
backend resolve o preço. Aceitar preço do cliente permite que ele assine o plano caro por
R$ 1,00.

**Validações:**
- plano sem `priceEnvKey` (ex.: o gratuito) → `400 Bad Request`;
- `userId` ausente no token → `401 Unauthorized`;
- Stripe não retornar URL → erro explícito, não retorne `null`.

### 5.2 Recepção de webhooks

Endpoint **público** (a Stripe não tem seu token de autenticação). A autenticação é feita pela
**assinatura criptográfica** do payload.

```
POST /payments/webhook
Header: stripe-signature: t=...,v1=...
Body:   (raw bytes)
```

Passos:

1. **Ler o corpo como bytes brutos.** A assinatura é calculada sobre o payload exato. Se o
   framework fizer parse de JSON e re-serializar, a verificação falha.
   - NestJS/Express: habilitar `rawBody: true` no bootstrap e ler `req.rawBody`.
   - FastAPI: `await request.body()`.
   - Spring: `@RequestBody String payload` (string crua, não objeto mapeado).
2. **Verificar a assinatura** com o SDK, usando `STRIPE_WEBHOOK_SECRET`. Falhou → `400`, sem
   processar nada. **Nunca** processe um evento não verificado — o endpoint é público e
   qualquer um pode postar nele.
3. **Rotear por `event.type`** para o handler correspondente.
4. **Responder `200` sempre que o evento foi recebido e tratado.** Tipo desconhecido → logar e
   responder `200` mesmo assim (senão a Stripe reenvia para sempre). Erro real de
   processamento → status não-2xx, para que a Stripe reentregue.

### 5.3 Handlers por evento

#### `checkout.session.completed` — primeira assinatura

Fonte do usuário: `session.metadata.userId`.

```
se falta userId, plan ou subscription → loga e retorna 200
   (um 4xx faria a Stripe reentregar para sempre algo que nunca vai dar certo)

updateMany User WHERE id = metadata.userId
                  AND stripeSubscriptionId IS DISTINCT FROM session.subscription:
   stripeCustomerId        = session.customer
   stripeSubscriptionId    = session.subscription
   stripeCheckoutSessionId = null
   subscriptionStatus      = "active"
   plan                    = metadata.plan
   credits                 += PLAN_CONFIG[plan].beneficio   (se aplicável)
```

> **Idempotência:** o filtro pela assinatura faz a reentrega do mesmo evento não casar com
> nenhuma linha. Sem ele, cada reentrega somaria os créditos de novo.

#### `invoice.payment_succeeded` — cobrança paga (1ª e renovações)

Fonte do usuário: busca por `stripeCustomerId` (o evento não tem `metadata`).

```
usuário = busca por stripeCustomerId == invoice.customer
se não achou → consulta a assinatura da fatura na Stripe e usa subscription.metadata.userId
   (a Stripe NÃO garante ordem: a 1ª fatura pode chegar antes do checkout.session.completed,
    quando stripeCustomerId ainda nem foi gravado. Por isso o checkout grava a metadata
    também em subscription_data.metadata.)
   falha de rede nessa consulta → 503, para a Stripe reentregar
se ainda não achou → return silencioso (evento de outro ambiente/cliente órfão)

plano = resolve pelo price id da fatura (invoice.lines[0].price.id → PLAN_CONFIG)
        fallback: plano atual do usuário

1) UPSERT em Payment, chaveado por stripeInvoiceId:
      amount   = invoice.amount_paid          (centavos)
      currency = invoice.currency
      paidAt   = invoice.status_transitions.paid_at ?? invoice.created   (epoch → datetime)
      urls     = invoice.hosted_invoice_url, invoice.invoice_pdf
      status   = PAID

2) SE invoice.billing_reason == "subscription_cycle":
      credits += PLAN_CONFIG[plano].beneficio
```

> **A armadilha mais importante deste sistema:** a primeira fatura chega com
> `billing_reason = "subscription_create"` e o `checkout.session.completed` **também** dispara
> para a mesma compra. Se você conceder o benefício nos dois, o usuário recebe em dobro.
> A regra: `checkout.session.completed` concede na assinatura inicial;
> `invoice.payment_succeeded` concede **apenas** quando é renovação (`subscription_cycle`).
>
> O registro em `Payment`, ao contrário, é gravado em **todas** as faturas — inclusive a
> primeira — porque o histórico precisa ser completo.

**Resolução plano ← Price ID:** itere o `PLAN_CONFIG`, resolva cada `priceEnvKey` na env e
compare com o Price ID da fatura. Isso é necessário porque a renovação não carrega `metadata`.

#### `invoice.payment_failed` — cobrança recusada

```
fatura sem assinatura → ignora
atualiza os User com stripeCustomerId == invoice.customer
                 E stripeSubscriptionId == assinatura da fatura:
   subscriptionStatus = "past_due"
```

Não rebaixe o plano imediatamente — a Stripe tem retentativas automáticas configuráveis.
`past_due` é um estado de aviso; a perda de acesso vem depois, via
`customer.subscription.deleted`.

Filtrar pela assinatura impede que uma falha atrasada de uma assinatura antiga marque
`past_due` quem já assinou de novo — ou volte um `canceled` para `past_due`.

#### `customer.subscription.updated` — mudança feita fora do app

```
cancel_at_period_end ou cancel_at   → subscriptionStatus = "canceling"
status == active                    → subscriptionStatus = "active"
status == past_due | unpaid         → subscriptionStatus = "past_due"
outros (incomplete, trialing...)    → ignora
aplicado nos User com stripeSubscriptionId == subscription.id
```

Mantém o status em sincronia quando o cancelamento agendado é desfeito (ou feito) pelo
painel da Stripe. Não mexe em `plan`.

#### `customer.subscription.deleted` — assinatura encerrada

```
atualiza os User com stripeCustomerId == subscription.customer
                 E stripeSubscriptionId == subscription.id:
   subscriptionStatus   = "canceled"
   stripeSubscriptionId = null
   plan                 = FREE
```

Este é o único evento que efetivamente rebaixa o plano. Cobre o fim do período após o
cancelamento, falha definitiva de cobrança e cancelamento pelo painel da Stripe.

Casar pelo id da assinatura, e não só pelo cliente, impede que um evento atrasado de uma
assinatura antiga rebaixe quem já assinou de novo.

> Note que os handlers de fatura/assinatura usam `updateMany` (update por filtro) em vez de
> update por PK: a busca é por `stripeCustomerId`, e o `updateMany` não estoura exceção quando
> não há match — comportamento desejado para eventos órfãos.

### 5.4 Cancelamento pelo usuário (no fim do período)

```
POST /payments/cancel  (autenticado)
  → sem stripeSubscriptionId          → 400 "sem assinatura ativa"
  → subscriptionStatus == "canceling" → 400 "já agendado"
  → chama Stripe: subscriptions.update(id, { cancel_at_period_end: true })
  → atualiza User: subscriptionStatus = "canceling"   (plano pago continua)
```

**Não cancele na hora.** O cliente pagou o mês inteiro; tirar o acesso no clique fica com o
dinheiro de um serviço que deixou de ser prestado (CDC Art. 51, IV). O rebaixamento para `FREE`
acontece quando a Stripe dispara `customer.subscription.deleted`, no fim do ciclo.

`stripeSubscriptionId` continua gravado: é por ele que o webhook acha o usuário, e é o que
permite retomar.

```
POST /payments/resume  (autenticado)
  → status != "canceling" → 400
  → subscriptions.update(id, { cancel_at_period_end: false })
  → subscriptionStatus = "active"
```

### 5.5 Cancelamento imediato e reembolso

**Cancelamento imediato** (`subscriptions.cancel`) só em dois casos, em que manter o período
pago não faz sentido: exclusão de conta (não sobra conta para usar) e reembolso (o dinheiro
volta, o acesso vai junto). Estado final: `canceled`, `stripeSubscriptionId = null`, `FREE`.

Na **exclusão de conta**, cancele na Stripe **antes** de apagar o usuário: a linha do usuário
guarda a única referência à assinatura. Apagando primeiro, uma falha no cancelamento deixa a
pessoa sendo cobrada por uma conta que não existe mais. O `Payment` sobrevive sem vínculo
(FK `ON DELETE SET NULL`), por obrigação fiscal.

**Reembolso** (direito de arrependimento, CDC Art. 49):

```
POST /payments/refund  (autenticado)
  → última Payment PAID do usuário; ausente ou paidAt > 7 dias → 400
  → PaymentIntent = invoicePayments.list({ invoice, status: "paid" })[0].payment.payment_intent
       (a partir das APIs 2025-x, invoice.payment_intent não existe mais)
     não achou → 422
  → refunds.create({ payment_intent }, { idempotencyKey: "refund-<paymentId>" })
  → Payment.status = REFUNDED
  → cancelamento imediato
  → credits = max(0, credits - PLAN_CONFIG[plano].beneficio)
```

Ordem importa: reembolso na Stripe primeiro, estado local depois. Um reembolso que falha
deixa o cliente pago e intocado — a direção segura de falhar. A idempotency key impede
reembolso duplo quando a pessoa repete o pedido depois de uma falha no meio.

### 5.6 Assinatura em dobro

Duas proteções no `createCheckout`:

1. Usuário com `stripeSubscriptionId` e status diferente de `canceled` → **409**. Trocar de
   plano não é checkout novo: a assinatura antiga ficaria órfã, cobrando todo mês.
2. A sessão de checkout anterior (`User.stripeCheckoutSessionId`) é consultada antes de
   criar outra:
   - `open` → `checkout.sessions.expire` (ninguém consegue mais pagar por ela);
   - `complete` → **409**: o pagamento aconteceu e o webhook ainda não chegou;
   - `expired` ou inexistente → segue.

Sem o item 2, duas abas de `/plans` (ou um duplo clique) abrem duas sessões antes de qualquer
webhook chegar, e as duas podem ser pagas.

---

## 6. Superfície HTTP

| Método | Rota | Proteção | Descrição |
|---|---|---|---|
| `POST` | `/payments/checkout` | autenticado + e-mail verificado | Body `{ plan }`. Retorna `{ url }` para redirecionar. `409` se já assina. |
| `POST` | `/payments/cancel` | autenticado + e-mail verificado | Agenda o fim para o fim do período pago. |
| `POST` | `/payments/resume` | autenticado + e-mail verificado | Desfaz o cancelamento agendado. |
| `POST` | `/payments/refund` | autenticado + e-mail verificado | Reembolso da última cobrança em até 7 dias; encerra o plano. |
| `GET` | `/payments/user` | autenticado + e-mail verificado | Histórico **do próprio** usuário (mais recentes primeiro). |
| `GET` | `/payments/user/:userId` | autenticado + **ADMIN** | Histórico de qualquer usuário. |
| `GET` | `/payments` | autenticado + **ADMIN** | Todas as cobranças. |
| `DELETE` | `/payments/:id` | autenticado + **ADMIN** | Remove um registro. `404` se não existir. |
| `POST` | `/payments/webhook` | **público** (validado por assinatura) | Recebe eventos da Stripe. |

**Regra de autorização crítica:** a rota "minhas cobranças" tira o `userId` **do token**, nunca
de parâmetro. A rota que aceita `userId` como parâmetro é exclusiva de admin. Misturar as duas
cria IDOR — qualquer usuário lendo faturas de qualquer outro.

**Nunca exponha** rotas de criação/edição de `Payment` — a tabela é escrita apenas pelo webhook.

---

## 7. Exposição do estado ao frontend

O endpoint de perfil do usuário devolve os campos de billing junto com os dados básicos:

```
{ name, email, plan, credits, subscriptionStatus, isVerified }
```

Isso permite ao frontend renderizar o estado da assinatura sem uma chamada extra. **Nunca**
exponha `stripeCustomerId` / `stripeSubscriptionId` ao cliente — são identificadores internos
de correlação.

Autorização de features deve ser checada **no backend**, lendo `plan`/`credits` do banco. O
frontend só esconde botões; não é controle de acesso.

---

## 8. Checklist de idempotência e concorrência

- [ ] `Payment` é gravado via **upsert** chaveado por `stripeInvoiceId` (único no banco). Reentrega
      atualiza a linha existente em vez de criar outra.
- [ ] Incremento de créditos usa **operação atômica no banco** (`credits = credits + N` / `increment`),
      nunca ler-somar-escrever na aplicação — isso perde updates sob concorrência.
- [ ] Concessão de benefício acontece em **exatamente um** caminho por cobrança (ver a armadilha
      em §5.3).
- [ ] Handlers que não encontram o usuário retornam sem erro (evento órfão de outro ambiente
      não deve gerar 500 e loop de reentrega).
- [ ] Eventos de tipo desconhecido retornam `200`.
- [ ] `checkout.session.completed` reentregue não credita de novo (filtro pela assinatura).
- [ ] Handlers de fatura não dependem da ordem de chegada (fallback pela metadata da assinatura).
- [ ] Eventos de assinatura casam pelo id da assinatura, não só pelo cliente.
- [ ] No máximo uma sessão de checkout aberta por usuário.
- [ ] Reembolso com idempotency key.

---

## 9. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Cliente escolhe o próprio preço | Backend resolve o Price ID a partir do nome do plano + env. |
| Webhook forjado libera plano de graça | Verificação obrigatória de assinatura antes de qualquer processamento. |
| Body parseado quebra a assinatura | Rota do webhook lê bytes brutos, sem middleware de JSON. |
| Reentrega duplica créditos/faturas | Upsert por `stripeInvoiceId` + concessão em caminho único. |
| Usuário fecha o browser antes do redirect | Liberação depende do webhook, não da `success_url`. |
| `success_url` falsificada | Nada é liberado no retorno do usuário; a rota de sucesso só exibe confirmação. |
| Vazamento de faturas entre usuários | `userId` do token nas rotas próprias; parâmetro só em rotas admin. |
| Segredos em código | Todos os IDs e chaves em env, com falha no boot se ausentes. |
| Mudança de API da Stripe | Versão da API fixada explicitamente no cliente. |
| Duas assinaturas para a mesma pessoa | 409 para quem já assina + expiração da sessão de checkout anterior. |
| Fatura antes do checkout (ordem de eventos) | Metadata também na assinatura; handler busca por ela. |
| Evento atrasado rebaixa quem assinou de novo | Filtro por `stripeSubscriptionId` nos eventos de assinatura e fatura. |
| Cancelar tira o período já pago | `cancel_at_period_end`; rebaixa só no `customer.subscription.deleted`. |
| Conta excluída continua sendo cobrada | Cancelamento na Stripe antes do `DELETE`. |
| Chave de teste em produção (ou live em dev) | Boot recusa a combinação. |

---

## 10. Testes recomendados

Mocke o SDK da Stripe e a camada de persistência; teste comportamento, não sintaxe.

**PaymentService**
- checkout: plano sem preço → erro; usuário com `customerId` → reutiliza cliente; sem → usa e-mail;
  `metadata` contém `userId` e `plan`; Stripe sem URL → erro.
- `checkout.session.completed`: metadata faltando → erro; caminho feliz grava os 5 campos.
- `invoice.payment_succeeded`: usuário inexistente → no-op; `subscription_create` grava Payment mas
  **não** credita; `subscription_cycle` grava Payment **e** credita; reentrega do mesmo `invoiceId`
  não duplica.
- `payment_failed` → `past_due`; `subscription.deleted` → `canceled` + `FREE`.
- cancelamento sem assinatura → erro.

**PaymentRecordService**
- upsert cria na primeira vez, atualiza na segunda;
- listagens ordenadas por `paidAt` desc;
- remoção de id inexistente → `404`.

**PaymentController**
- guards aplicados nas rotas certas (rota admin recusa usuário comum);
- assinatura inválida no webhook → `400`;
- cada `event.type` chama o handler correspondente;
- tipo desconhecido → `200`.

---

## 11. Ordem de implementação sugerida

1. Migração do banco: campos de billing no `User` + tabela `Payment` com os índices/uniques.
2. Enum de planos + mapa `PLAN_CONFIG` + variáveis de ambiente.
3. Cliente da Stripe como singleton, com versão de API fixada.
4. `PaymentRecordService` (CRUD puro) + testes.
5. `PaymentService.createCheckout` + rota autenticada.
6. Endpoint de webhook com **raw body** e verificação de assinatura (teste com o Stripe CLI:
   `stripe listen --forward-to localhost:PORT/payments/webhook`).
7. Handlers, um por vez, na ordem: `checkout.session.completed` → `invoice.payment_succeeded`
   → `invoice.payment_failed` → `customer.subscription.deleted`.
8. Cancelamento pelo usuário.
9. Rotas de consulta (usuário e admin).
10. Exposição de `plan` / `credits` / `subscriptionStatus` no endpoint de perfil.
