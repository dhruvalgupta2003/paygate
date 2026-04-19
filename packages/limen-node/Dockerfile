# syntax=docker/dockerfile:1.9

# ----- build stage --------------------------------------------------------
FROM node:20.18.0-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json turbo.json ./
COPY packages/limen-node/package.json  packages/limen-node/package.json
COPY packages/limen-node/tsconfig.json packages/limen-node/tsconfig.json
COPY packages/limen-node/tsup.config.ts packages/limen-node/tsup.config.ts

RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter @limen/node... --frozen-lockfile=false

COPY packages/limen-node/src packages/limen-node/src
RUN pnpm --filter @limen/node build

# ----- runtime stage ------------------------------------------------------
FROM gcr.io/distroless/nodejs20-debian12:nonroot

WORKDIR /app
USER nonroot:nonroot
ENV NODE_ENV=production
EXPOSE 4021 9464

COPY --from=builder --chown=nonroot:nonroot /app/packages/limen-node/dist /app/dist
COPY --from=builder --chown=nonroot:nonroot /app/node_modules /app/node_modules
COPY --from=builder --chown=nonroot:nonroot /app/packages/limen-node/node_modules /app/packages/limen-node/node_modules

ENTRYPOINT ["/nodejs/bin/node", "/app/dist/cli.js"]
CMD ["start"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://localhost:4021/livez').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
