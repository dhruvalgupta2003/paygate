import type { NextFunction, Request, Response } from 'express';
import { CoreProxy, type CoreProxyDeps } from '../proxy/core.js';
import type { PayGateRequest } from '../types.js';

export interface ExpressPayGateOptions extends Omit<CoreProxyDeps, 'upstream'> {
  readonly upstream?: string;
}

/** Express middleware factory.  Use `app.use(paygate({...}))`. */
export function paygate(options: ExpressPayGateOptions) {
  const proxy = new CoreProxy({
    ...options,
    upstream: options.upstream ?? 'http://localhost:3000',
  });

  return async function paygateMiddleware(req: Request, res: Response, next: NextFunction) {
    const pgReq: PayGateRequest = {
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      query: req.query as PayGateRequest['query'],
      headers: req.headers as PayGateRequest['headers'],
      ip: req.ip,
      body: req.body instanceof Buffer ? req.body : undefined,
    };

    try {
      const result = await proxy.handle(pgReq);
      if (result.response.status === 402 || result.response.status >= 400) {
        res.status(result.response.status);
        for (const [k, v] of Object.entries(result.response.headers)) res.setHeader(k, v);
        res.end(result.response.body);
        return;
      }
      // If verify succeeded, let the inner Express app handle the route so
      // the user's handler runs.  We still signal that payment was observed
      // via a res.locals attachment.
      res.locals['paygate'] = {
        verifyResult: result.verifyResult,
        auth: result.auth,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
