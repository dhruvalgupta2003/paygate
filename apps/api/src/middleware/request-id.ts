import type { MiddlewareHandler } from 'hono';
import { newUlid } from '../lib/id.js';

/**
 * Request ID middleware.  Honours an inbound `X-Request-Id` only when it
 * matches the PayGate ULID shape; otherwise mints a fresh ULID.  The ID is
 * stored in context and echoed back in both the response header and every
 * error envelope.
 */

const ULID_RX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function requestIdMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const inbound = c.req.header('x-request-id');
    const id = inbound !== undefined && ULID_RX.test(inbound) ? inbound : newUlid();
    c.set('requestId', id);
    c.header('X-Request-Id', id);
    await next();
  };
}
