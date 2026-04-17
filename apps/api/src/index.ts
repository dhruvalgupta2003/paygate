import { serve } from '@hono/node-server';
import { loadEnv } from './config/env.js';
import { createLogger } from './lib/logger.js';
import { createApp } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const log = createLogger();
  const app = createApp();

  const server = serve(
    { fetch: app.fetch, hostname: env.HOST, port: env.PORT },
    (info) => {
      log.info({ host: info.address, port: info.port }, 'paygate-api listening');
    },
  );

  const shutdown = (signal: NodeJS.Signals) => {
    log.info({ signal }, 'shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('uncaughtException', (err) => {
    log.fatal({ err: err.message, stack: err.stack }, 'uncaught exception');
    process.exit(1);
  });
}

void main();
