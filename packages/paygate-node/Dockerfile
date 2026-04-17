# syntax=docker/dockerfile:1.9

# ----- build stage --------------------------------------------------------
FROM node:20.18.0-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json turbo.json ./
COPY packages/paygate-node/package.json  packages/paygate-node/package.json
COPY packages/paygate-node/tsconfig.json packages/paygate-node/tsconfig.json
COPY packages/paygate-node/tsup.config.ts packages/paygate-node/tsup.config.ts

RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter @paygate/node... --frozen-lockfile=false

COPY packages/paygate-node/src packages/paygate-node/src
RUN pnpm --filter @paygate/node build

# ----- runtime stage ------------------------------------------------------
FROM gcr.io/distroless/nodejs20-debian12:nonroot

WORKDIR /app
USER nonroot:nonroot
ENV NODE_ENV=production
EXPOSE 4021 9464

COPY --from=builder --chown=nonroot:nonroot /app/packages/paygate-node/dist /app/dist
COPY --from=builder --chown=nonroot:nonroot /app/node_modules /app/node_modules
COPY --from=builder --chown=nonroot:nonroot /app/packages/paygate-node/node_modules /app/packages/paygate-node/node_modules

ENTRYPOINT ["/nodejs/bin/node", "/app/dist/cli.js"]
CMD ["start"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://localhost:4021/livez').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
