# syntax=docker/dockerfile:1.9

FROM node:20.18.0-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json turbo.json ./
COPY packages/paygate-node/package.json   packages/paygate-node/package.json
COPY packages/paygate-node/tsconfig.json  packages/paygate-node/tsconfig.json
COPY packages/paygate-node/tsup.config.ts packages/paygate-node/tsup.config.ts
COPY examples/hono-api/package.json       examples/hono-api/package.json
COPY examples/hono-api/tsconfig.json      examples/hono-api/tsconfig.json

RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter paygate-example-hono-api... --frozen-lockfile=false

COPY packages/paygate-node/src packages/paygate-node/src
COPY examples/hono-api/src     examples/hono-api/src
RUN pnpm --filter @paygate/node build

FROM node:20.18.0-bookworm-slim AS runtime
WORKDIR /app/examples/hono-api
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
COPY --from=builder /app /app
USER node
CMD ["node", "--experimental-strip-types", "src/index.ts"]
