import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { webhookSubscriptions, webhookDeliveries, projects } from '../db/schema.js';

const create = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().min(32).optional(),
});

const deliveriesQuery = z.object({
  status: z.enum(['pending', 'delivered', 'failed', 'dead']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

async function firstProjectId(): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ id: projects.id }).from(projects).limit(1);
  return rows[0]?.id ?? null;
}

export const webhooksRoutes = new Hono()
  .get('/', async (c) => {
    const db = getDb();
    const rows = await db
      .select()
      .from(webhookSubscriptions)
      .orderBy(desc(webhookSubscriptions.createdAt));
    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        url: r.url,
        events: r.events,
        enabled: r.enabled,
        created_at: r.createdAt.toISOString(),
      })),
    });
  })
  .post('/', zValidator('json', create), async (c) => {
    const body = c.req.valid('json');
    const db = getDb();
    const projectId = await firstProjectId();
    if (!projectId) {
      return c.json({ error: 'no_project', detail: 'no project exists yet' }, 404);
    }
    const id = randomUUID();
    const secret =
      body.secret ?? randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    await db.insert(webhookSubscriptions).values({
      id,
      projectId,
      url: body.url,
      events: body.events,
      secret,
      enabled: true,
    });
    return c.json({ id, url: body.url, events: body.events, enabled: true }, 201);
  })
  .delete('/:id', async (c) => {
    const id = c.req.param('id');
    const db = getDb();
    await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, id));
    return c.body(null, 204);
  })
  .get('/deliveries', zValidator('query', deliveriesQuery), async (c) => {
    const q = c.req.valid('query');
    const db = getDb();
    const base = db
      .select()
      .from(webhookDeliveries)
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(q.limit)
      .$dynamic();
    const rows = q.status ? await base.where(eq(webhookDeliveries.status, q.status)) : await base;
    return c.json({
      items: rows.map((r) => ({
        id: r.id,
        subscription_id: r.subscriptionId,
        event: r.event,
        status: r.status,
        attempt: r.attempt,
        response_code: r.lastResponseCode,
        delivered_at: r.deliveredAt?.toISOString() ?? null,
        created_at: r.createdAt.toISOString(),
      })),
    });
  })
  .post('/deliveries/:id/redeliver', (c) =>
    c.json({ id: c.req.param('id'), status: 'requeued' }),
  )
  .post('/:id/rotate', async (c) => {
    const id = c.req.param('id');
    const db = getDb();
    const newSecret = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    await db
      .update(webhookSubscriptions)
      .set({ secret: newSecret, rotatedAt: new Date() })
      .where(eq(webhookSubscriptions.id, id));
    return c.json({ id, rotated_at: new Date().toISOString() });
  });
