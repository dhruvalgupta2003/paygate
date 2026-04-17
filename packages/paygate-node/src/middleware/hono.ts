import type { MiddlewareHandler } from 'hono';
import { CoreProxy, type CoreProxyDeps } from '../proxy/core.js';
import type { PayGateRequest } from '../types.js';

export interface HonoPayGateOptions extends Omit<CoreProxyDeps, 'upstream'> {
  readonly upstream?: string;
}

export function paygateHono(options: HonoPayGateOptions): MiddlewareHandler {
  const proxy = new CoreProxy({
    ...options,
    upstream: options.upstream ?? 'http://localhost:3000',
  });

  return async (c, next) => {
    const req = c.req;
    const url = new URL(req.url);
    const pgReq: PayGateRequest = {
      method: req.method,
      url: req.url,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams) as PayGateRequest['query'],
      headers: Object.fromEntries(req.raw.headers as unknown as Iterable<[string, string]>) as PayGateRequest['headers'],
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      body: undefined,
    };
    const result = await proxy.handle(pgReq);
    if (result.response.status === 402 || result.response.status >= 400) {
      return c.body(result.response.body ?? null, result.response.status as never, result.response.headers);
    }
    c.set('paygate', { auth: result.auth, verifyResult: result.verifyResult });
    await next();
  };
}
