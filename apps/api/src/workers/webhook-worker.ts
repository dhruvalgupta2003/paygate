import type { Logger } from 'pino';
import { closeDb, getDb } from '../db/index.js';
import { childLogger } from '../lib/logger.js';
import { WebhookService } from '../services/webhook-service.js';

/**
 * Background worker that drains the webhook_deliveries queue.
 *
 * Each tick:
 *   1. claim a batch of pending deliveries due now (transactional UPDATE)
 *   2. dispatch each in parallel; the service handles markDelivered/markFailed
 *   3. log the outcome counts
 *
 * Retry schedule (Fibonacci-ish, 12 attempts over ~24h) lives in
 * services/webhook-service.ts so the dispatch path is the single source of
 * truth. This worker is just the scheduler.
 */

const TICK_INTERVAL_MS = 1000;
const BATCH_SIZE = 25;

export interface WebhookDispatcher {
  claimDueBatch: WebhookService['claimDueBatch'];
  dispatch: WebhookService['dispatch'];
}

export interface TickOutcome {
  readonly claimed: number;
  readonly succeeded: number;
  readonly failed: number;
}

export interface WorkerHandle {
  readonly stop: () => Promise<void>;
}

/**
 * Run a single tick: claim a due batch and dispatch in parallel. Exported so
 * tests can drive it without spinning up the interval loop.
 */
export async function tickOnce(
  service: WebhookDispatcher,
  batchSize: number,
  log: Logger,
): Promise<TickOutcome> {
  const due = await service.claimDueBatch(batchSize);
  if (due.length === 0) return { claimed: 0, succeeded: 0, failed: 0 };

  const results = await Promise.allSettled(due.map((d) => service.dispatch(d)));
  let succeeded = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value === true) succeeded += 1;
    else failed += 1;
  }
  log.info({ claimed: due.length, succeeded, failed }, 'webhook.tick.done');
  return { claimed: due.length, succeeded, failed };
}

export function runWebhookWorker(): WorkerHandle {
  const log = childLogger({ worker: 'webhook-worker' });
  const service = new WebhookService({ db: getDb() });
  log.info({ batchSize: BATCH_SIZE, intervalMs: TICK_INTERVAL_MS }, 'webhook worker started');

  let busy = false;
  let stopped = false;

  const tick = async (): Promise<void> => {
    // Single-flight: skip if the previous tick is still draining.
    if (busy || stopped) return;
    busy = true;
    try {
      await tickOnce(service, BATCH_SIZE, log);
    } catch (err) {
      log.error(
        { err: err instanceof Error ? err.message : 'unknown' },
        'webhook.tick.failed',
      );
    } finally {
      busy = false;
    }
  };

  const interval = setInterval(() => void tick(), TICK_INTERVAL_MS);
  void tick();

  const stop = async (): Promise<void> => {
    stopped = true;
    clearInterval(interval);
    // Drain in-flight tick before resolving so the caller can close the DB.
    while (busy) await new Promise((resolve) => setTimeout(resolve, 50));
    log.info({}, 'webhook worker stopped');
  };

  return { stop };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const handle = runWebhookWorker();
  const log = childLogger({ worker: 'webhook-worker' });
  const shutdown = (signal: NodeJS.Signals): void => {
    log.info({ signal }, 'shutting down webhook worker');
    void handle
      .stop()
      .then(closeDb)
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        log.error({ err: err instanceof Error ? err.message : 'unknown' }, 'shutdown failed');
        process.exit(1);
      });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  process.on('uncaughtException', (err) => {
    log.fatal({ err: err.message, stack: err.stack }, 'uncaught exception');
    process.exit(1);
  });
}
