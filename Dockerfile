# ---- Build Stage ----
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

COPY . .

# 클라이언트 번들에 박히는 값이다. VITE_* 값은 브라우저에 공개되는 값만 넘긴다.
ARG BUILD_ID=dev
ARG DEPLOY_ENV=production
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENV
RUN BUILD_ID="$BUILD_ID" DEPLOY_ENV="$DEPLOY_ENV" pnpm run build && pnpm run build:server && pnpm prune --prod

# ---- Production Stage ----
FROM node:24-alpine AS runner

WORKDIR /app

ARG BUILD_ID=dev
ARG DEPLOY_ENV=production
# 서버는 클라이언트 번들과 같은 배포 식별자로 낡은 탭을 판정한다.
ENV NODE_ENV=production \
    PORT=3000 \
    BUILD_ID=$BUILD_ID \
    DEPLOY_ENV=$DEPLOY_ENV

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-ssr ./dist-ssr

USER node

EXPOSE 3000

CMD ["node", "dist-ssr/main.js"]
