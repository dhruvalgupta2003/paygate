import type { ErrorHandler, NotFoundHandler } from 'hono';
import { ZodError } from 'zod';
import { HTTPException } from 'hono/http-exception';
import { ErrorCode, LimenError, toLimenError } from '../lib/errors.js';
import { childLogger } from '../lib/logger.js';

/**
 * Global error funnel.  Every thrown value becomes a Limen envelope:
 *   { error, detail, requestId, retryable, docs, ... }
 *
 * ZodError → VALIDATION_FAILED with the first issue path/message.
 * HTTPException → mapped to appropriate code by status.
 * Any other unknown throw → INTERNAL, and the original is logged at error.
 */

export const globalErrorHandler: ErrorHandler = (err, c) => {
  const requestId = (c.get('requestId') as string | undefined) ?? 'unknown';
  const log = childLogger({ requestId, path: c.req.path, method: c.req.method });

  const pe = normalise(err);
  const payload = pe.toEnvelope(requestId);

  if (pe.http >= 500) {
    log.error({ err: { name: err instanceof Error ? err.name : 'unknown', message: pe.detail } }, 'request.error');
  } else {
    log.warn({ code: pe.code, detail: pe.detail }, 'request.warn');
  }

  if (pe.retryAfterMs !== undefined) {
    c.header('Retry-After', String(Math.ceil(pe.retryAfterMs / 1000)));
  }

  return c.json(payload, pe.http as Parameters<typeof c.json>[1]);
};

export const notFoundHandler: NotFoundHandler = (c) => {
  const requestId = (c.get('requestId') as string | undefined) ?? 'unknown';
  const pe = new LimenError({
    code: ErrorCode.NOT_FOUND,
    detail: `no route for ${c.req.method} ${c.req.path}`,
  });
  return c.json(pe.toEnvelope(requestId), pe.http as Parameters<typeof c.json>[1]);
};

function normalise(err: unknown): LimenError {
  if (err instanceof LimenError) return err;

  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const path = issue?.path.join('.') ?? '';
    const msg = issue?.message ?? 'validation failed';
    return new LimenError({
      code: ErrorCode.VALIDATION_FAILED,
      detail: path.length > 0 ? `${path}: ${msg}` : msg,
      extra: { issues: err.issues },
    });
  }

  if (err instanceof HTTPException) {
    const code = statusToCode(err.status);
    return new LimenError({ code, detail: err.message || code });
  }

  return toLimenError(err);
}

function statusToCode(status: number): ErrorCode {
  if (status === 400) return ErrorCode.VALIDATION_FAILED;
  if (status === 401) return ErrorCode.UNAUTHORIZED;
  if (status === 403) return ErrorCode.FORBIDDEN;
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status === 409) return ErrorCode.CONFLICT;
  if (status === 429) return ErrorCode.RATE_LIMITED;
  if (status === 502) return ErrorCode.UPSTREAM_FAILED;
  if (status === 503) return ErrorCode.SERVICE_DEGRADED;
  if (status === 504) return ErrorCode.UPSTREAM_TIMEOUT;
  return ErrorCode.INTERNAL;
}
