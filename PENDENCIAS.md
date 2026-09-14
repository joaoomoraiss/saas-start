# Pendências

Decisões que precisam de você. Atualizado em 14/09/2026.

---

## 1. Preencher as contas externas

Resend, Cloudflare Turnstile e Stripe dependem de conta sua. Os campos estão
vazios nos `.env.example`, marcados com **PREENCHER A MAO**, e o passo a passo
está no README (seção "Variáveis para preencher à mão").

Sem eles o projeto roda em modo de desenvolvimento: e-mails só no log, cadastro
sem captcha e `/payments` em 503.

## 2. Nova migration: sessões e billing

`prisma/migrations/20260914120000_sessions_and_billing_hardening/`:

- cria `RefreshToken` (sessões) e `UsedToken` (links de uso único);
- adiciona `User.stripeCheckoutSessionId`;
- troca a FK `Payment.userId` de `CASCADE` para `SET NULL` (a coluna passa a
  aceitar null).

Não há `DROP` de dado. Ela foi validada pela suíte e2e, que aplica as
migrations reais num Postgres em memória. **Nenhum banco seu foi tocado.**

Efeito colateral: refresh tokens emitidos antes dela não existem na tabela, e
**todo mundo logado precisa entrar de novo uma vez**.

```bash
cd backend && npx prisma migrate deploy
```

## 3. O fluxo de pagamento não foi testado contra a Stripe de verdade

A regra de negócio está coberta por testes unitários com o SDK mockado, e a
superfície HTTP por testes e2e. Nenhuma chamada real à Stripe foi feita.

Antes de confiar em produção, rode com o Stripe CLI em modo teste: checkout,
renovação, cancelamento no fim do período, retomada e reembolso.

Pontos que eu mais gostaria de ver confirmados com eventos reais:

- `planFromInvoice` lê `invoice.lines.data[0].pricing.price_details.price`.
  Se vier `null`, cai no plano atual do usuário.
- O reembolso localiza o PaymentIntent por `invoicePayments.list`, API nova
  que substituiu `invoice.payment_intent`.
- `customer.subscription.updated` precisa estar assinado no endpoint de
  produção (ver `docs/DEPLOY.md`).

## 4. Troca de plano não existe

Quem já assina recebe 409 ao tentar outro checkout. Isso é de propósito: um
checkout novo criaria uma segunda assinatura. Upgrade e downgrade precisam de
`subscriptions.update` com proration, ou do Customer Portal da Stripe. Fica
para quando o produto tiver planos definidos.

## 5. Docker não foi buildado nesta máquina

O Docker Desktop não estava rodando, então os `Dockerfile` e o
`docker-compose.yml` da raiz não foram buildados aqui. O job `docker` do CI
builda as três imagens em cada push. Para testar localmente, abra o Docker
Desktop e rode `docker compose up --build`.

## 6. O que do ABNT-checker ficou de fora

- **Painel admin** (`/admin/users`, `/admin/metrics` e a página). O proxy já
  protege `/admin`, mas a página não existe.
- **Flag única de ambiente** (`PROD`) que deriva domínios e CORS.
- **Extras de SEO**: `manifest.ts`, `apple-icon`, JSON-LD.
- **Kit de componentes** `components/ui`.

## 7. Páginas legais são rascunho genérico

`/termos-de-uso`, `/politica-de-privacidade` e `/politica-de-cookies` têm texto
neutro. Servem de estrutura, **não** de documento jurídico. Revise com
advogado antes de publicar. A política de privacidade precisa listar Stripe,
Resend, Cloudflare e Google (se o Analytics estiver ligado).

## 8. Sobras do fakedoor no backend

`model Email` com `enum Buttons { COMMON, BUY }` e o `MailController`
(`POST /mail`, público, grava e-mails) parecem resto do projeto fakedoor. A
rota agora passa pelo rate limit global, mas continua pública. Não removi
porque apagar tabela é migração destrutiva. Se não usa, vale apagar o módulo e
fazer um `DROP TABLE` numa migration futura.

## 9. Os `.git` aninhados foram movidos, não apagados

Backups em `~/projects/.saas-start-nested-git-backup/`. Quando confirmar que
não precisa mais, pode apagar a pasta.
