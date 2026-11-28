# 관리자 대시보드 및 관리자 API 독립 서버 이미지 — 저장소 루트를 빌드 컨텍스트로 쓴다.
#   docker build -f admin/Dockerfile .
# ---- Build Stage ----
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

COPY . .

# 클라이언트 번들에 박히는 값이다. VITE_* 값은 브라우저에 공개되는 값만 넘긴다.
ARG BUILD_ID=dev
ARG DEPLOY_ENV=production
# 같은 오리진의 관리자 API(/api/admin/*)를 쓰므로 클라우드 모드로 빌드한다.
ARG VITE_CLOUD=1
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENV
RUN BUILD_ID="$BUILD_ID" DEPLOY_ENV="$DEPLOY_ENV" pnpm run build:admin && pnpm run build:admin:server && pnpm prune --prod

# ---- Production Stage ----
FROM node:24-alpine AS runner

WORKDIR /app

ARG BUILD_ID=dev
ARG DEPLOY_ENV=production
ENV NODE_ENV=production \
    PORT=8080 \
    BUILD_ID=$BUILD_ID \
    DEPLOY_ENV=$DEPLOY_ENV

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist-admin ./dist-admin
COPY --from=builder /app/dist-ssr-admin ./dist-ssr-admin

USER node

EXPOSE 8080

CMD ["node", "dist-ssr-admin/adminMain.js"]
