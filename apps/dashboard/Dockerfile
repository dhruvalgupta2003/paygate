# syntax=docker/dockerfile:1.9

FROM node:25.9.0-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY apps/dashboard/package.json apps/dashboard/tsconfig.json apps/dashboard/vite.config.ts apps/dashboard/postcss.config.js apps/dashboard/tailwind.config.ts apps/dashboard/index.html ./apps/dashboard/
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter limen-dashboard... --frozen-lockfile=false
COPY apps/dashboard/src ./apps/dashboard/src
COPY apps/dashboard/public ./apps/dashboard/public
RUN pnpm --filter limen-dashboard build

FROM nginx:1.27-alpine
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1
