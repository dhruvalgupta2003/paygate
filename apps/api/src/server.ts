import { Hono } from 'hono';
import { OpenAPIHono } from '@hono/zod-openapi';
import { globalErrorHandler, notFoundHandler } from './middleware/error.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { securityHeadersMiddleware } from './middleware/security-headers.js';
import { corsMiddleware } from './middleware/cors.js';
import { loggingMiddleware } from './middleware/logging.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { authMiddleware } from './middleware/auth.js';
import { healthRoutes } from './routes/health.js';
import { analyticsRoutes } from './routes/analytics.js';
import { transactionsRoutes } from './routes/transactions.js';
import { endpointsRoutes } from './routes/endpoints.js';
import { agentsRoutes } from './routes/agents.js';
import { refundsRoutes } from './routes/refunds.js';
import { webhooksRoutes } from './routes/webhooks.js';
import { configRoutes } from './routes/config.js';
import { directoryRoutes } from './routes/directory.js';
import { dsrRoutes } from './routes/dsr.js';
import { evidenceRoutes } from './routes/evidence.js';
import { complianceRoutes } from './routes/compliance.js';
import { auditRoutes } from './routes/audit.js';

export interface CreateAppOptions {
  /** When true, skip auth middleware on the admin surface.  Localhost-only. */
  readonly unauthenticated?: boolean;
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const app = new OpenAPIHono();

  app.use('*', requestIdMiddleware());
  app.use('*', loggingMiddleware());
  app.use('*', securityHeadersMiddleware());
  app.use('*', corsMiddleware());
  app.onError(globalErrorHandler);
  app.notFound(notFoundHandler);

  // Public health + metrics — no auth.
  app.route('/', healthRoutes);

  // Admin surface.
  const admin = new OpenAPIHono();
  if (!options.unauthenticated) {
    admin.use('*', authMiddleware());
  }
  admin.use('*', rateLimitMiddleware({ perMinute: 60 }));

  admin.route('/analytics', analyticsRoutes);
  admin.route('/transactions', transactionsRoutes);
  admin.route('/endpoints', endpointsRoutes);
  admin.route('/agents', agentsRoutes);
  admin.route('/refunds', refundsRoutes);
  admin.route('/webhooks', webhooksRoutes);
  admin.route('/config', configRoutes);
  admin.route('/directory', directoryRoutes);
  admin.route('/dsr', dsrRoutes);
  admin.route('/evidence', evidenceRoutes);
  admin.route('/compliance', complianceRoutes);
  admin.route('/audit', auditRoutes);

  app.route('/_limen/v1', admin);

  app.doc('/_limen/v1/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Limen Admin API', version: '0.1.0' },
  });

  return app as unknown as Hono;
}
