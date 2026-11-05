# 관리자 대시보드 이미지 — 정적 번들만 서빙한다. 저장소 루트를 빌드 컨텍스트로 쓴다.
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
# 같은 오리진의 게임 서버 API(/api/admin/*)를 쓰므로 클라우드 모드로 빌드한다.
ARG VITE_CLOUD=1
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENV
RUN BUILD_ID="$BUILD_ID" DEPLOY_ENV="$DEPLOY_ENV" pnpm run build:admin

# ---- Production Stage ----
FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist-admin /usr/share/nginx/html

EXPOSE 8080
