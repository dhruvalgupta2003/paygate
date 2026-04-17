import type { CoreProxyDeps } from '../proxy/core.js';
import { CoreProxy } from '../proxy/core.js';
import type { PayGateRequest } from '../types.js';

/**
 * Next.js App Router middleware.  Compatible with Vercel's Edge runtime
 * when using an Upstash Redis store (install `@paygate/node-edge` for the
 * edge-only runtime; this module uses the Node runtime).
 */
export function paygateEdge(options: Omit<CoreProxyDeps, 'upstream'> & { upstream?: string }) {
  const proxy = new CoreProxy({
    ...options,
    upstream: options.upstream ?? 'http://localhost:3000',
  });

  return async function middleware(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const bodyBuf =
      request.method === 'GET' || request.method === 'HEAD'
        ? undefined
        : new Uint8Array(await request.clone().arrayBuffer());

    const pgReq: PayGateRequest = {
      method: request.method,
      url: request.url,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams) as PayGateRequest['query'],
      headers: Object.fromEntries(request.headers) as PayGateRequest['headers'],
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      body: bodyBuf,
    };

    const result = await proxy.handle(pgReq);
    return new Response(result.response.body ?? null, {
      status: result.response.status,
      headers: result.response.headers,
    });
  };
}
