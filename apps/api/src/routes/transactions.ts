import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const listQuery = z.object({
  status: z.enum(['settled', 'refunded', 'reorged', 'upstream_failed']).optional(),
  chain: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const transactionsRoutes = new Hono()
  .get('/', zValidator('query', listQuery), (c) => {
    return c.json({ items: [], next_cursor: null });
  })
  .get('/:id', (c) => {
    const id = c.req.param('id');
    return c.json({ id, status: 'unknown' }, 404);
  });
