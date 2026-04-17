import { Hono } from 'hono';

export const auditRoutes = new Hono()
  .get('/verify', (c) => c.json({ ok: true, rows: 0 }))
  .get('/tail', (c) => {
    const since = c.req.query('since') ?? '5m';
    return c.json({ since, rows: [] });
  });
