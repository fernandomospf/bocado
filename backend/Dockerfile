# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# Dependências (cache separado do código)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate \
 && npm run build \
 && npm run build:seed \
 && npm prune --omit=dev

# Runtime enxuto, usuário sem privilégios
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/dist-seed ./dist-seed
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --chown=app:app package.json ./
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health || exit 1
# Aplica migrations pendentes e carrega a TACO (o seed não faz nada se ela já estiver no banco)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist-seed/prisma/seed.js && node dist/main.js"]
