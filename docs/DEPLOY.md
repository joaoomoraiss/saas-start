# Deploy em produção

Checklist do que precisa estar certo antes de abrir o SaaS para usuários
reais. A configuração local está no [README](../README.md).

---

## 1. Banco e migrations

1. **Faça backup antes** de qualquer `migrate deploy` num banco com dados.
2. Rode as migrations **antes** de subir a versão nova da API:

   ```bash
   cd backend && npx prisma migrate deploy
   ```

   No Docker, o serviço `migrate` do `docker-compose.yml` faz isso e a API só
   sobe depois que ele termina.

3. A migration `20260914120000_sessions_and_billing_hardening` cria a tabela
   de sessões. Refresh tokens emitidos **antes** dela não existem no banco.
   **Todo mundo que estava logado precisa entrar de novo** uma vez. Não há
   perda de dado.

## 2. Variáveis de ambiente

### Backend

| Variável | Produção |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | banco real |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_VERIFY_SECRET`, `JWT_FORGOT_SECRET` | novos, 32+ caracteres, todos diferentes |
| `SERVICE_TOKEN` | novo, 32+ caracteres, igual ao do frontend |
| `FRONTEND_URL` | `https://seudominio.com` |
| `APP_NAME` | nome do produto |
| `TRUST_PROXY` | número de proxies na frente da API (ex.: `1`) |
| `RESEND_API_KEY`, `MAIL_FROM` | obrigatórios na prática: sem eles, confirmação e reset respondem 503 |
| `CONTACT_EMAIL` | caixa do formulário de contato |
| `TURNSTILE_SECRET_KEY` | **obrigatório**: sem ele o cadastro fica sem captcha |
| `STRIPE_SECRET_KEY` | chave **live** (`sk_live_`) |
| `STRIPE_WEBHOOK_SECRET` | o `whsec_` do endpoint de produção (não o do `stripe listen`) |
| `STRIPE_PRICE_ID_*` | Price IDs do modo live |

O boot recusa: secret curto ou repetido, grupo Stripe ou Resend pela metade,
chave `sk_test_` com `NODE_ENV=production`. Ele também avisa no log quando
`TURNSTILE_SECRET_KEY`, `RESEND_API_KEY` ou `CONTACT_EMAIL` estão vazias.

### Frontend

| Variável | Produção |
|---|---|
| `BACKEND_URL` | URL interna ou pública da API |
| `JWT_SECRET` | igual ao do backend |
| `SERVICE_TOKEN` | igual ao do backend |
| `NEXT_PUBLIC_DOMAIN_URL` | `https://seudominio.com` (**no build**) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | site key do widget de produção (**no build**) |
| `NEXT_PUBLIC_GA_ID` | opcional (**no build**) |

`NEXT_PUBLIC_*` é embutida no bundle durante o `next build`. Trocar o valor
exige gerar o build de novo.

`JWT_SECRET` no front é o que permite ao proxy validar a navegação sem ir à
API. Trate o servidor do Next com o mesmo cuidado da API: quem tem esse
segredo consegue emitir access tokens.

## 3. Stripe

1. No Dashboard (modo live), crie o endpoint
   `POST https://api.seudominio.com/payments/webhook`.
2. Assine **exatamente** estes eventos:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Copie o signing secret do endpoint para `STRIPE_WEBHOOK_SECRET`.
4. Antes de liberar, rode o caminho completo em modo teste com o Stripe CLI:
   checkout, renovação (`stripe trigger invoice.payment_succeeded`),
   cancelamento, retomada e reembolso.

A API fica pública só no `/payments/webhook` para a Stripe. O resto pode ficar
atrás da rede interna, acessível só pelo Next.

## 4. Proxy reverso e IP real

O rate limit conta por IP do visitante. O Next lê `X-Real-IP` (ou o primeiro
item de `X-Forwarded-For`) e repassa à API com o `SERVICE_TOKEN`.

- Vercel e Cloudflare já definem esses cabeçalhos corretamente.
- Um nginx precisa de `proxy_set_header X-Real-IP $remote_addr;`.
- **Não** use `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`
  como única fonte: essa diretiva concatena o valor enviado pelo cliente, e ele
  consegue forjar o primeiro IP da lista.

Sem isso, o rate limit trata todo o tráfego como um IP só: um atacante gasta a
cota de login do site inteiro.

## 5. Rate limit com mais de uma instância

O storage do throttler é **em memória**: não sobrevive a restart e não é
compartilhado. Com N réplicas da API, o limite efetivo vira N vezes o
configurado. Para escalar horizontalmente, troque por um storage Redis
(`@nestjs/throttler` aceita `storage` customizado).

O job de limpeza de sessões expiradas roda de hora em hora em cada instância.
Ele é idempotente: rodar em várias réplicas só repete trabalho.

## 6. HTTPS e cookies

- Com `NODE_ENV=production`, os cookies de sessão saem com `Secure`, e o
  navegador não os grava em HTTP. HTTPS é obrigatório no front.
- Os cookies de sessão são do domínio do front (`SameSite=Lax`). A API não
  precisa estar no mesmo domínio.

## 7. Health check

`GET /health` responde `{"status":"ok"}` quando a API alcança o banco, e 503
quando não. A imagem Docker da API já usa essa rota no `HEALTHCHECK`.

## 8. Antes de abrir para o público

- [ ] Páginas legais revisadas por advogado (`/termos-de-uso`,
      `/politica-de-privacidade`, `/politica-de-cookies`).
- [ ] Política de privacidade lista os subprocessadores: Stripe, Resend,
      Cloudflare e Google (se o Analytics estiver ligado).
- [ ] Domínio verificado no Resend (SPF/DKIM) e e-mail de teste chegando fora
      do spam.
- [ ] Widget do Turnstile com o domínio de produção nos hostnames.
- [ ] Fluxo de pagamento testado ponta a ponta no modo teste da Stripe.
