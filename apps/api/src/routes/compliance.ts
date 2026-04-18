import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { complianceEvents } from '../db/schema.js';

const listQuery = z.object({
  kind: z.enum(['sanctions', 'geo', 'travel_rule']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const complianceRoutes = new Hono().get(
  '/events',
  zValidator('query', listQuery),
  async (c) => {
    const q = c.req.valid('query');
    const db = getDb();

    const base = db
      .select({
        id: complianceEvents.id,
        kind: complianceEvents.kind,
        detail: complianceEvents.detail,
        at: complianceEvents.at,
      })
      .from(complianceEvents)
      .orderBy(desc(complianceEvents.at))
      .limit(q.limit)
      .$dynamic();

    const rows = q.kind ? await base.where(eq(complianceEvents.kind, q.kind)) : await base;

    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        detail: r.detail ?? {},
        at: r.at.toISOString(),
      })),
    });
  },
);
