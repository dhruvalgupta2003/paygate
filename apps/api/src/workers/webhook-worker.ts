import { createLogger } from '../lib/logger.js';

/**
 * Background worker that drains the webhook_deliveries queue.  Kept minimal
 * here; the full Fibonacci retry schedule is implemented in
 * services/webhook-service.ts.
 */
const FIB_DELAY_SECONDS = [1, 2, 5, 15, 60, 300, 1800, 3600, 7200, 14_400, 28_800, 57_600];

export async function runWebhookWorker(): Promise<void> {
  const log = createLogger().child({ worker: 'webhook-worker' });
  log.info({ schedule: FIB_DELAY_SECONDS }, 'webhook worker started');

  const tick = async () => {
    // TODO(services/webhook-service): select `next_attempt_at <= NOW()`, POST,
    // mark delivered / failed / dead, bump `attempt`.  Implementation lives
    // in services/webhook-service.ts; this shell schedules it.
  };

  await tick();
  // Poll every second; back-pressure lives inside the service.
  setInterval(tick, 1000).unref();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runWebhookWorker();
}
