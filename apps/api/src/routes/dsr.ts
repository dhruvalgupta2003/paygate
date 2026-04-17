import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const redactBody = z.object({
  wallet: z.string().min(1),
  scope: z.enum(['analytics', 'audit', 'all']).default('analytics'),
});

export const dsrRoutes = new Hono()
  .post('/redact', zValidator('json', redactBody), (c) => {
    const body = c.req.valid('json');
    return c.json({ wallet: body.wallet, scope: body.scope, status: 'tombstoned' });
  })
  .get('/export', (c) => {
    const wallet = c.req.query('wallet');
    if (!wallet) return c.json({ error: 'INVALID_PAYMENT_HEADER', detail: 'wallet required' }, 400);
    return c.json({ wallet, rows: [] });
  });
