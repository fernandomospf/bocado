# Bocado

Contador de calorias e macronutrientes com registro por foto (Claude), descrição em texto ou entrada manual.

| Camada   | Stack                                              |
|----------|----------------------------------------------------|
| Frontend | Next.js 16 (App Router, standalone), React 19, SWR |
| Backend  | NestJS 11, Prisma 6, Passport (JWT + Google)       |
| Banco    | PostgreSQL 17                                      |
| IA       | Claude via `@anthropic-ai/sdk` (tool use)          |
| Deploy   | Docker Compose (pronto para Coolify)               |

## Arquitetura

```
navegador / webview ──HTTPS──▶ frontend (Next :3000)
                                 │  /api/*  (rewrite interno)
                                 ▼
                               backend (Nest :3001) ──▶ postgres
                                 │
                                 └──▶ API da Anthropic
```

Só o frontend é público. As chamadas `/api/*` chegam ao backend pela rede interna do
compose, então web e API ficam no mesmo domínio e a sessão usa cookie `httpOnly`
(`SameSite=Lax`), sem CORS e sem token no `localStorage`.

## Deploy no Coolify

1. Crie um recurso **Docker Compose** apontando para este repositório (arquivo `docker-compose.yml`).
2. Em **Environment Variables**, preencha as variáveis de `.env.example`.
   Gere segredos com `openssl rand -hex 32` (hex evita quebrar a `DATABASE_URL`).
3. Em **Domains**, associe seu domínio **somente ao serviço `frontend`**, porta `3000`.
4. Deploy. As migrations rodam sozinhas na subida do backend (`prisma migrate deploy`).
5. Health check: `https://SEU_DOMINIO/api/health`.

### Login com Google

1. Google Cloud Console → APIs e serviços → Credenciais → **ID do cliente OAuth** (aplicativo da Web).
2. Origem JavaScript autorizada: `https://SEU_DOMINIO`
3. URI de redirecionamento autorizado: `https://SEU_DOMINIO/api/auth/google/callback`
4. Copie Client ID e Secret para `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` e faça redeploy.

Sem essas variáveis o botão do Google simplesmente não aparece.

> **WebView:** o Google bloqueia OAuth dentro de WebViews embutidas (`disallowed_useragent`).
> Funciona instalando o app como PWA ("Adicionar à tela inicial") ou, num wrapper nativo,
> abrindo `/api/auth/google` no navegador do sistema (Custom Tabs / SFSafariViewController).
> E-mail e senha funcionam em qualquer WebView.

## Rodando localmente

Tudo em Docker:

```bash
cp .env.example .env   # preencha POSTGRES_PASSWORD, JWT_SECRET, ANTHROPIC_API_KEY
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# http://localhost:3000
```

Desenvolvimento com hot reload:

```bash
# banco
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres

# backend
cd backend
npm install
export DATABASE_URL="postgresql://bocado:SENHA@localhost:5432/bocado?schema=public"
export JWT_SECRET="$(openssl rand -hex 32)" APP_URL="http://localhost:3000" COOKIE_SECURE=false
export ANTHROPIC_API_KEY="..."
npx prisma migrate deploy
npm run start:dev

# frontend (outro terminal)
cd frontend
npm install
npm run dev      # rewrite padrão aponta para http://localhost:3001
```

Ao mudar o `schema.prisma`, gere uma nova migration com `npm run prisma:migrate -- --name descricao`.

## API

Todas as rotas exigem sessão, exceto as marcadas como públicas.

| Método | Rota                              | Descrição                                     |
|--------|-----------------------------------|-----------------------------------------------|
| GET    | `/api/health`                     | Status da API e do banco (pública)            |
| GET    | `/api/auth/providers`             | Quais logins estão ativos (pública)           |
| POST   | `/api/auth/register`              | Cadastro (pública)                            |
| POST   | `/api/auth/login`                 | Login (pública)                               |
| POST   | `/api/auth/logout`                | Encerra a sessão (pública)                    |
| GET    | `/api/auth/me`                    | Usuário atual + se concluiu o questionário    |
| GET    | `/api/auth/google`                | Inicia OAuth do Google (pública)              |
| GET    | `/api/profile`                    | Perfil, metas e sugestão calculada            |
| POST   | `/api/profile/preview`            | Calcula a sugestão sem salvar                 |
| PUT    | `/api/profile`                    | Salva/atualiza dados do questionário          |
| PUT    | `/api/profile/targets`            | Metas personalizadas                          |
| POST   | `/api/profile/targets/reset`      | Volta para a sugestão                         |
| POST   | `/api/analysis/photo`             | multipart `image` (+ `hint` opcional)         |
| POST   | `/api/analysis/text`              | `{ description }`                             |
| POST   | `/api/meals`                      | Cria refeição com itens                       |
| PATCH  | `/api/meals/:id/items/:itemId`    | Edita um alimento                             |
| DELETE | `/api/meals/:id/items/:itemId`    | Remove um alimento (o último remove a refeição) |
| DELETE | `/api/meals/:id`                  | Remove a refeição                             |
| GET    | `/api/days/:date`                 | Metas, totais e refeições do dia              |
| GET    | `/api/days?from=&to=`             | Totais por dia (até 93 dias)                  |

## Como as metas são calculadas

- **TMB:** Mifflin-St Jeor (peso, altura, idade, sexo biológico).
- **Gasto diário:** TMB × fator de atividade (1,2 a 1,9).
- **Objetivo:** perder −20%, manter 0%, ganhar +10%. Piso de 1.200 kcal (F) / 1.500 kcal (M).
- **Proteína:** 2,0 / 1,6 / 1,8 g/kg conforme o objetivo; com IMC > 30 usa o peso equivalente a IMC 25.
- **Gordura:** 25% das calorias (mínimo 0,6 g/kg). **Carboidratos:** o restante.

Se o usuário personaliza as metas, elas são preservadas quando ele atualiza peso ou atividade,
até que ele toque em "Usar sugestão".

## Análise por foto

- A foto é reduzida no aparelho (maior lado 1280 px, JPEG) antes do envio e **não é armazenada**.
- O Claude responde por tool use forçado, então a saída é sempre JSON estruturado.
- O servidor valida, limita e arredonda os números antes de devolver.
- Cada item vem com confiança (`Confira`, `Provável`, `Confiável`) e pode ser ajustado antes de salvar;
  mudar a porção reescala os macros.
- Limite de 12 análises por minuto por usuário.

## Estrutura

```
backend/
  prisma/              schema + migrations
  src/auth/            JWT em cookie, Google OAuth com state anti-CSRF, guard global
  src/profile/         questionário, cálculo de metas (nutrition.ts)
  src/meals/           refeições e resumos diários
  src/analysis/        integração com o Claude (prompt + tool)
frontend/
  src/app/(auth)/      login e cadastro
  src/app/onboarding/  questionário em 5 etapas
  src/app/(app)/       Hoje, Adicionar, Histórico, Perfil + barra de abas
  src/components/      anéis, sheet, editores, vidro
  src/app/globals.css  sistema visual liquid glass (claro/escuro)
```
