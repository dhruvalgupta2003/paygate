import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const summaryQuery = z.object({
  range: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
});

const timeseriesQuery = z.object({
  metric: z.enum(['revenue_usdc', 'requests_total', 'verify_failures_total', 'rate_limit_drops_total']),
  step: z.enum(['1m', '5m', '1h', '1d']).default('1h'),
  range: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
});

export const analyticsRoutes = new Hono()
  .get('/summary', zValidator('query', summaryQuery), (c) => {
    const q = c.req.valid('query');
    return c.json({
      range: q.range,
      revenueUsdc: '0.000000',
      requests: 0,
      unique_wallets: 0,
      top_endpoints: [],
    });
  })
  .get('/timeseries', zValidator('query', timeseriesQuery), (c) => {
    const q = c.req.valid('query');
    return c.json({
      metric: q.metric,
      step: q.step,
      range: q.range,
      points: [],
    });
  });
