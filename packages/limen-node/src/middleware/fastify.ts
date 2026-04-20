import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { CoreProxy, type CoreProxyDeps } from '../proxy/core.js';
import type { LimenRequest } from '../types.js';

export interface FastifyLimenOptions extends Omit<CoreProxyDeps, 'upstream'> {
  readonly upstream?: string;
}

export const limenFastify: FastifyPluginAsync<FastifyLimenOptions> = async (
  app: FastifyInstance,
  options: FastifyLimenOptions,
) => {
  const proxy = new CoreProxy({
    ...options,
    upstream: options.upstream ?? 'http://localhost:3000',
    // Guard mode: Fastify's preHandler hook either short-circuits the
    // response (402/4xx/5xx) or falls through to the user's route handler
    // — never forwards to a separate upstream.
    guardMode: true,
  });

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Fastify 4+ removed `routerPath`; derive the path from the raw URL.
    const [pathOnly = '/'] = req.url.split('?');
    const pgReq: LimenRequest = {
      method: req.method,
      url: req.url,
      path: pathOnly,
      query: req.query as LimenRequest['query'],
      headers: req.headers as LimenRequest['headers'],
      ip: req.ip,
      body: req.body instanceof Buffer ? req.body : undefined,
    };
    const result = await proxy.handle(pgReq);
    if (result.response.status === 402 || result.response.status >= 400) {
      for (const [k, v] of Object.entries(result.response.headers)) reply.header(k, v);
      reply.code(result.response.status).send(result.response.body);
    }
  });
};

export default limenFastify;
