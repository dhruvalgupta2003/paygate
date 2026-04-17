import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { collectMetricsText } from '../lib/metrics.js';
import { getDb } from '../db/index.js';

export const healthRoutes = new Hono()
  .get('/livez', (c) => c.text('ok'))
  .get('/readyz', async (c) => {
    try {
      await getDb().execute(sql`SELECT 1`);
      return c.text('ok');
    } catch {
      return c.text('degraded', 503);
    }
  })
  .get('/metrics', async (c) => {
    const body = await collectMetricsText();
    c.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    return c.body(body);
  });
