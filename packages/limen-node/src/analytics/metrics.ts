import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'limen_' });

export const metrics = {
  requestsTotal: new Counter({
    name: 'limen_requests_total',
    help: 'Total HTTP requests handled, by outcome.',
    labelNames: ['endpoint', 'outcome'],
    registers: [registry],
  }),
  httpDurationSeconds: new Histogram({
    name: 'limen_http_duration_seconds',
    help: 'End-to-end request latency.',
    labelNames: ['route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  }),
  verifyDurationSeconds: new Histogram({
    name: 'limen_verify_duration_seconds',
    help: 'Chain verify latency.',
    labelNames: ['chain', 'mode'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  }),
  settleDurationSeconds: new Histogram({
    name: 'limen_settle_duration_seconds',
    help: 'Settle latency.',
    labelNames: ['chain', 'mode'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [registry],
  }),
  verifyFailuresTotal: new Counter({
    name: 'limen_verify_failures_total',
    help: 'Verification failures, by reason.',
    labelNames: ['chain', 'reason'],
    registers: [registry],
  }),
  replayRejectsTotal: new Counter({
    name: 'limen_replay_rejects_total',
    help: 'Replay attempts.',
    registers: [registry],
  }),
  rateLimitDropsTotal: new Counter({
    name: 'limen_rate_limit_drops_total',
    help: 'Rate-limit drops.',
    labelNames: ['scope'],
    registers: [registry],
  }),
  rpcFailuresTotal: new Counter({
    name: 'limen_rpc_failures_total',
    help: 'RPC errors.',
    labelNames: ['chain', 'provider', 'status'],
    registers: [registry],
  }),
  cacheHitsTotal: new Counter({
    name: 'limen_cache_hits_total',
    help: 'Cache hits.',
    labelNames: ['kind'],
    registers: [registry],
  }),
  cacheMissesTotal: new Counter({
    name: 'limen_cache_misses_total',
    help: 'Cache misses.',
    labelNames: ['kind'],
    registers: [registry],
  }),
  upstreamDurationSeconds: new Histogram({
    name: 'limen_upstream_duration_seconds',
    help: 'Upstream latency.',
    labelNames: ['endpoint', 'status'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry],
  }),
  upstreamFailuresTotal: new Counter({
    name: 'limen_upstream_failures_total',
    help: 'Upstream errors.',
    labelNames: ['endpoint', 'status'],
    registers: [registry],
  }),
  auditWriteFailuresTotal: new Counter({
    name: 'limen_audit_write_failures_total',
    help: 'Audit write failures.',
    registers: [registry],
  }),
  webhookDeliverySeconds: new Histogram({
    name: 'limen_webhook_delivery_seconds',
    help: 'Webhook delivery latency.',
    labelNames: ['event'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry],
  }),
  webhookDeliveryFailuresTotal: new Counter({
    name: 'limen_webhook_delivery_failures_total',
    help: 'Webhook failures.',
    labelNames: ['event', 'status'],
    registers: [registry],
  }),
} as const;

export async function collectMetricsText(): Promise<string> {
  return registry.metrics();
}
