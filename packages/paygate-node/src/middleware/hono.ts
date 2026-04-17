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

  const handler: MiddlewareHandler = async (c, next) => {
    const req = c.req;
    const url = new URL(req.url);
    const pgReq: PayGateRequest = {
      method: req.method,
      url: req.url,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams) as PayGateRequest['query'],
      headers: Object.fromEntries(
        req.raw.headers as unknown as Iterable<[string, string]>,
      ) as PayGateRequest['headers'],
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      body: undefined,
    };

    const result = await proxy.handle(pgReq);

    if (result.response.status === 402 || result.response.status >= 400) {
      // Set every header, then return a native Response so Hono's strict
      // body-union typing stays out of our way.
      for (const [k, v] of Object.entries(result.response.headers)) {
        c.header(k, v);
      }
      const body = result.response.body;
      const payload =
        body === undefined
          ? null
          : typeof body === 'string'
            ? body
            : new Uint8Array(body);
      return new Response(payload, { status: result.response.status });
    }

    c.set('paygate', { auth: result.auth, verifyResult: result.verifyResult });
    await next();
    return undefined;
  };

  return handler;
}
