import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const listQuery = z.object({
  kind: z.enum(['sanctions', 'geo', 'travel_rule']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const complianceRoutes = new Hono().get('/events', zValidator('query', listQuery), (c) =>
  c.json({ items: [] }),
);
