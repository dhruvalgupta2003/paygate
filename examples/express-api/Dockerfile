# syntax=docker/dockerfile:1.9

# ----- build stage --------------------------------------------------------
FROM node:20.18.0-bookworm-slim AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json turbo.json ./
COPY packages/paygate-node/package.json       packages/paygate-node/package.json
COPY packages/paygate-node/tsconfig.json      packages/paygate-node/tsconfig.json
COPY packages/paygate-node/tsup.config.ts     packages/paygate-node/tsup.config.ts
COPY examples/express-api/package.json        examples/express-api/package.json
COPY examples/express-api/tsconfig.json       examples/express-api/tsconfig.json

RUN --mount=type=cache,target=/root/.pnpm-store \
    pnpm install --filter paygate-example-express-api... --frozen-lockfile=false

COPY packages/paygate-node/src       packages/paygate-node/src
COPY examples/express-api/src        examples/express-api/src
RUN pnpm --filter @paygate/node build

# ----- runtime stage ------------------------------------------------------
FROM node:20.18.0-bookworm-slim AS runtime

WORKDIR /app/examples/express-api
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

COPY --from=builder /app /app

USER node
CMD ["node", "--experimental-strip-types", "src/server.ts"]
