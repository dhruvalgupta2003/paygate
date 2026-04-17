import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { newUlid } from '../lib/id.js';

const create = z.object({ tx_hash: z.string().min(1), reason: z.string().min(1) });
const confirm = z.object({ refund_tx_hash: z.string().min(1) });

export const refundsRoutes = new Hono()
  .post('/', zValidator('json', create), (c) => {
    const body = c.req.valid('json');
    const id = newUlid();
    return c.json({ id, status: 'requested', ...body }, 201);
  })
  .post('/:id/confirm', zValidator('json', confirm), (c) => {
    const id = c.req.param('id');
    return c.json({ id, status: 'confirmed' });
  });
