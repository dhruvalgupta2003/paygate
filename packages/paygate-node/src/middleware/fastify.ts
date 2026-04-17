import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { CoreProxy, type CoreProxyDeps } from '../proxy/core.js';
import type { PayGateRequest } from '../types.js';

export interface FastifyPayGateOptions extends Omit<CoreProxyDeps, 'upstream'> {
  readonly upstream?: string;
}

export const paygateFastify: FastifyPluginAsync<FastifyPayGateOptions> = async (
  app: FastifyInstance,
  options: FastifyPayGateOptions,
) => {
  const proxy = new CoreProxy({
    ...options,
    upstream: options.upstream ?? 'http://localhost:3000',
  });

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // Fastify 4+ removed `routerPath`; derive the path from the raw URL.
    const [pathOnly = '/'] = req.url.split('?');
    const pgReq: PayGateRequest = {
      method: req.method,
      url: req.url,
      path: pathOnly,
      query: req.query as PayGateRequest['query'],
      headers: req.headers as PayGateRequest['headers'],
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

export default paygateFastify;
