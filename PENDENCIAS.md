# Pendências

Decisões que precisam de você. Atualizado em 12/08/2026.

---

## 1. Push bloqueado — a chave SSH tem passphrase e não há agent

Corrigindo o que eu tinha escrito antes: **sua chave está cadastrada no GitHub
sim**. O problema é outro.

`~/.ssh/id_ed25519` é uma chave criptografada (`aes256-ctr` + `bcrypt` KDF), ou
seja, protegida por passphrase. Não existe `ssh-agent` rodando nesta sessão:

```
$ ssh-add -l
Could not open a connection to your authentication agent
```

Então o ssh oferece a chave pública, o GitHub aceita e pede a prova, o ssh
tenta ler a chave privada, não consegue descriptografar sem a passphrase, e
como não há terminal interativo para perguntar, cai em
`Permission denied (publickey)`.

Eu não consigo destravar isso: qualquer comando meu roda sem tty e não tem como
receber a passphrase. **Você resolve rodando o push direto na sessão**, que aí
o prompt aparece:

```
! git push -u origin feat/saas-boilerplate
```

Ou carregando a chave num agent antes:

```
eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519
```

O remote `origin` já está configurado e os commits estão prontos.

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

## 3. A migração de banco ainda não foi aplicada em lugar nenhum

Criei `prisma/migrations/20260812120000_billing/` (campos de billing no `User`
+ tabela `Payment`). Ela é **puramente aditiva** — só `ADD COLUMN`, `CREATE
TABLE` e índices, nada de `DROP` ou alteração de coluna existente.

Ela foi validada de verdade: a suíte e2e aplica as migrations reais contra um
Postgres em memória (PGlite) e passa. Mas **nenhum banco seu foi tocado** — não
rodei `prisma migrate deploy` em desenvolvimento nem em produção.

Quando quiser aplicar:

```bash
cd backend && npx prisma migrate deploy
```

Se você já tinha um banco de dev com dados, confira antes — é aditiva, então
não deve haver perda, mas a decisão de rodar é sua.

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

## 5. `/users` virou `/user` (breaking change)

O controller respondia em `/users`, mas o frontend e o `API_ROUTES.md` sempre
falaram `/user`. Alinhei o backend para `/user` — é a URL que o resto do mundo
já esperava.

Se você tiver algum cliente antigo apontando para `/users`, ele quebra. Os
testes e2e foram atualizados junto.

## 6. Páginas legais são rascunho genérico

`/termos-de-uso`, `/politica-de-privacidade` e `/politica-de-cookies` têm texto
neutro de placeholder. Servem de estrutura, **não** de documento jurídico.
Revise com advogado antes de publicar qualquer projeto.

## 7. O fluxo de pagamento não foi testado contra a Stripe de verdade

A regra de negócio está coberta por 40 testes unitários com o SDK mockado, e a
superfície HTTP por 20 testes e2e (guards, IDOR, rejeição de webhook não
assinado). Mas nenhuma chamada real à Stripe foi feita — não tenho credencial e
não criaria conta/custo sem você pedir.

Antes de confiar em produção, rode o caminho completo com o Stripe CLI:

```bash
stripe listen --forward-to localhost:8080/payments/webhook
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
```

O que eu mais gostaria de ver confirmado com evento real é o `planFromInvoice`:
ele lê `invoice.lines.data[0].pricing.price_details.price`, um caminho que
mudou de lugar nas versões recentes da API. Se vier `null`, o código cai no
plano atual do usuário (não quebra), mas a renovação creditaria a cota errada
se o usuário tivesse trocado de plano.

## 8. Sobras do fakedoor no backend

`model Email` com `enum Buttons { COMMON, BUY }` e o `MailController` que grava
e-mails parecem resto do projeto fakedoor, não de um boilerplate de SaaS. Não
removi porque apagar tabela é migração destrutiva. Se não usa, vale um
`DROP TABLE` numa migration futura.
