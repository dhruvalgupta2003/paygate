# syntax=docker/dockerfile:1.9

FROM node:20.18.0-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json turbo.json ./
COPY packages/limen-node/package.json   packages/limen-node/package.json
COPY packages/limen-node/tsconfig.json  packages/limen-node/tsconfig.json
COPY packages/limen-node/tsup.config.ts packages/limen-node/tsup.config.ts
COPY examples/hono-api/package.json       examples/hono-api/package.json
COPY examples/hono-api/tsconfig.json      examples/hono-api/tsconfig.json

RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter limen-example-hono-api... --frozen-lockfile=false

COPY packages/limen-node/src packages/limen-node/src
COPY examples/hono-api/src     examples/hono-api/src
RUN pnpm --filter @limen/node build

FROM node:20.18.0-bookworm-slim AS runtime
WORKDIR /app/examples/hono-api
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
COPY --from=builder /app /app
USER node
CMD ["node", "--experimental-strip-types", "src/index.ts"]
