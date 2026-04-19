# syntax=docker/dockerfile:1.9

FROM node:20.18.0-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
COPY pnpm-workspace.yaml package.json tsconfig.base.json turbo.json ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/tsup.config.ts ./apps/api/
RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter limen-api... --frozen-lockfile=false
COPY apps/api/src ./apps/api/src
RUN pnpm --filter limen-api build

FROM gcr.io/distroless/nodejs20-debian12:nonroot
WORKDIR /app
USER nonroot:nonroot
ENV NODE_ENV=production
EXPOSE 4020 9464

COPY --from=builder --chown=nonroot:nonroot /app/apps/api/dist /app/dist
COPY --from=builder --chown=nonroot:nonroot /app/node_modules /app/node_modules
COPY --from=builder --chown=nonroot:nonroot /app/apps/api/node_modules /app/apps/api/node_modules

ENTRYPOINT ["/nodejs/bin/node", "/app/dist/index.js"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://localhost:4020/livez').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
