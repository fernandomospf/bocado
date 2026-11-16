# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
# Endereço da API dentro da rede do compose (usado nas rewrites)
ARG INTERNAL_API_URL=http://backend:3001
ENV INTERNAL_API_URL=$INTERNAL_API_URL
# Variáveis NEXT_PUBLIC_* são gravadas no build: chave pública do Turnstile e URL pública (links canônicos e Open Graph)
ARG NEXT_PUBLIC_TURNSTILE_SITEKEY=
ARG NEXT_PUBLIC_APP_URL=
ENV NEXT_PUBLIC_TURNSTILE_SITEKEY=$NEXT_PUBLIC_TURNSTILE_SITEKEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "server.js"]
