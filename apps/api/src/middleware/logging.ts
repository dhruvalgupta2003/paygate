import type { MiddlewareHandler } from 'hono';
import { childLogger } from '../lib/logger.js';
import { metrics } from '../lib/metrics.js';

/**
 * Per-request logger + Prometheus instrumentation.  The incoming body is
 * never logged; only metadata.  `X-Request-Id` is already populated by
 * request-id middleware.
 */

export function loggingMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = process.hrtime.bigint();
    const requestId = c.get('requestId') as string | undefined;
    const log = childLogger({
      requestId: requestId ?? 'unknown',
      method: c.req.method,
      path: c.req.path,
    });
    c.set('logger', log);

    try {
      await next();
    } finally {
      const durSec = Number(process.hrtime.bigint() - start) / 1e9;
      const status = c.res.status;
      const route = (c.get('routePattern') as string | undefined) ?? c.req.routePath ?? c.req.path;
      metrics.requestsTotal.labels(route, c.req.method, String(status)).inc();
      metrics.requestDurationSeconds.labels(route, c.req.method, String(status)).observe(durSec);
      log.info(
        {
          status,
          durationMs: Math.round(durSec * 1000),
          remote: c.req.header('x-forwarded-for') ?? 'direct',
        },
        'request.complete',
      );
    }
  };
}
