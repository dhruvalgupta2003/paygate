import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { CoreProxy, type CoreProxyDeps } from '../proxy/core.js';
import type { LimenRequest } from '../types.js';

export interface ExpressLimenOptions extends Omit<CoreProxyDeps, 'upstream'> {
  readonly upstream?: string;
}

/** Express middleware factory.  Use `app.use(limen({...}))`. */
export function limen(options: ExpressLimenOptions): RequestHandler {
  const proxy = new CoreProxy({
    ...options,
    upstream: options.upstream ?? 'http://localhost:3000',
  });

  const handler: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
    const pgReq: LimenRequest = {
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      query: req.query as LimenRequest['query'],
      headers: req.headers as LimenRequest['headers'],
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
      res.locals['limen'] = {
        verifyResult: result.verifyResult,
        auth: result.auth,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
  return handler;
}
