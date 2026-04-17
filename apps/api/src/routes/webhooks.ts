import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { newId } from '../lib/id.js';

const create = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
  secret: z.string().min(32).optional(),
});

const deliveriesQuery = z.object({
  status: z.enum(['pending', 'delivered', 'failed', 'dead']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const webhooksRoutes = new Hono()
  .get('/', (c) => c.json({ items: [] }))
  .post('/', zValidator('json', create), (c) => {
    const body = c.req.valid('json');
    return c.json({ id: newId(), ...body }, 201);
  })
  .delete('/:id', (c) => c.body(null, 204))
  .get('/deliveries', zValidator('query', deliveriesQuery), (c) => c.json({ items: [] }))
  .post('/deliveries/:id/redeliver', (c) => c.json({ id: c.req.param('id'), status: 'requeued' }))
  .post('/:id/rotate', (c) => {
    const id = c.req.param('id');
    return c.json({ id, rotated_at: new Date().toISOString() });
  });
