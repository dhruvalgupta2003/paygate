import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const submit = z.object({
  project: z.object({
    name: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/),
    description: z.string().optional(),
    homepage: z.string().url().optional(),
  }),
  signed_challenge: z.string().min(1),
});

export const directoryRoutes = new Hono()
  .get('/listing', (c) => c.json({ listed: false }))
  .post('/submit', zValidator('json', submit), (c) => {
    const body = c.req.valid('json');
    return c.json({ slug: body.project.slug, listed: true, status: 'approved' });
  })
  .post('/unlist', (c) => c.json({ listed: false }));
