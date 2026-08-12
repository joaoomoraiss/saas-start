# Pendências

Decisões que precisam de você. Registradas em 12/08/2026.

---

## 1. Push bloqueado — a chave SSH desta máquina não está no GitHub

`git remote add origin git@github.com:joaoomoraiss/saas-start.git` foi feito, o
commit está pronto, mas o push falha:

```
git@github.com: Permission denied (publickey).
```

A chave `~/.ssh/id_ed25519` é oferecida e o GitHub recusa — ela não está
cadastrada na sua conta. Não mexi em credencial nem gerei chave nova.

Para resolver, cadastre a chave pública em <https://github.com/settings/keys>:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPiZBSVdoWN4FtiBfJGmow/urEN+DmQB2DxHxePelteP jooaommorais@gmail.com
```

Depois:

```bash
cd ~/projects/saas-start
git push -u origin feat/saas-boilerplate
```

## 2. Commit ficou em branch, não na `main`

Sua regra é nunca commitar direto na `main`, então o trabalho está em
`feat/saas-boilerplate`. Como o repositório remoto está vazio, para o
`git clone` funcionar direto você vai querer a `main` apontando para isso:

```bash
git checkout main && git merge --ff-only feat/saas-boilerplate
git push -u origin main
```

Deixei a decisão com você porque não dá para reverter um `push` na `main` de um
repo público sem reescrever histórico.

## 3. O backend deste repo NÃO atende o que o frontend chama

Este é o gap mais importante. Você pediu para atualizar o frontend nesta
sessão, então **não toquei no backend** — mas eles não conversam ainda.

O frontend (`services/user`, `services/payments`) espera:

| Chamada do frontend | Existe no backend? |
|---|---|
| `POST /auth/*` (register, login, confirm, verify-email, forgot/reset-password, refresh-token, logout) | ✅ sim, tudo bate |
| `GET /user/profile` | ❌ o controller é `@Controller('users')` e não tem rota `profile` |
| `PATCH /user/profile`, `PATCH /user/password` | ❌ não existem |
| `POST /payments/checkout`, `POST /payments/cancel`, `GET /payments/user` | ❌ não há módulo de pagamentos |

E o `model User` do Prisma só tem `id, email, password, role, isVerified,
createdAt, updatedAt`. Faltam os campos que o frontend lê: `name`, `plan`,
`credits`, `subscriptionStatus`, `stripeCustomerId`, `stripeSubscriptionId`.

**Consequência prática:** hoje o fluxo de auth funciona ponta a ponta; o
dashboard, o /settings, o /plans e o /success quebram na chamada ao perfil.

`docs/PAYMENT_ARCHITECTURE.md` descreve exatamente a arquitetura a implementar
(modelo de dados, webhook idempotente, tabela `Payment`). O contrato que o
frontend espera está em `frontend/.claude/skills/API_ROUTES.md` §3 e §4.

Não comecei porque envolve **migração de banco** — está na sua lista de "pare e
registre".

## 4. Os `.git` aninhados foram movidos, não apagados

`frontend/` e `backend/` eram repositórios git separados, com remotes próprios
(`motion-frontend` e `fakedoor-boilerplate`). Isso impedia o `saas-start` de ser
um repo único clonável — viraria gitlink quebrado.

Movi os diretórios (não apaguei) para:

```
~/projects/.saas-start-nested-git-backup/frontend.git
~/projects/.saas-start-nested-git-backup/backend.git
```

O histórico dos dois também continua no GitHub. Quando você confirmar que não
precisa mais, pode apagar a pasta de backup.

⚠️ O `backend/` tinha ~20 arquivos modificados e não commitados em relação ao
`fakedoor-boilerplate`. Essas modificações estão preservadas nos arquivos e
entraram no commit deste repo, mas se você quiser levá-las de volta para o
`fakedoor-boilerplate`, precisa restaurar o `.git` do backup antes.

## 5. Páginas legais são rascunho genérico

`/termos-de-uso`, `/politica-de-privacidade` e `/politica-de-cookies` têm texto
neutro de placeholder. Servem de estrutura, **não** de documento jurídico.
Revise com advogado antes de publicar qualquer projeto.

## 6. Backend ainda não foi genericizado

Fora do escopo desta sessão. Sobrou lá: `model Email` com `enum Buttons
{ COMMON, BUY }` (parece resto do fakedoor), o nome do package e o README padrão
do Nest. Os testes do backend eu não rodei — precisam de PostgreSQL de pé.
