import { Hono } from 'hono';

export const configRoutes = new Hono().post('/reload', (c) => {
  // In production, this triggers a hot reload of limen.config.yml.
  // Here we respond with a no-op until orchestrated with the proxy.
  return c.json({ reloaded: true, at: new Date().toISOString() });
});
