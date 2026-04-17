import pino, { type Logger as PinoLogger } from 'pino';
import type { Logger } from '../types.js';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-payment"]',
  'req.headers["x-paygate-admin"]',
  'res.headers["set-cookie"]',
  '*.authorization.r',
  '*.authorization.s',
  '*.transaction',
  '*.signedMessage',
  '*.privateKey',
  '*.secret',
  'wallet', // pseudonymous but excessive; the full-wallet field should use walletFull
];

export interface CreateLoggerOptions {
  readonly level?: string;
  readonly pretty?: boolean;
  readonly redactBodies?: boolean;
}

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  const level = opts.level ?? process.env['LOG_LEVEL'] ?? 'info';
  const pretty =
    opts.pretty ??
    (process.env['NODE_ENV'] !== 'production' && process.stdout.isTTY === true);

  const base: pino.LoggerOptions = {
    level,
    base: { svc: 'paygate', ver: process.env['PAYGATE_VERSION'] ?? 'dev' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    formatters: {
      level(label) {
        return { lvl: label };
      },
    },
  };

  const logger: PinoLogger = pretty
    ? pino({
        ...base,
        transport: {
          target: 'pino/file',
          options: { destination: 1, colorize: true },
        },
      })
    : pino(base);

  return wrap(logger);
}

function wrap(l: PinoLogger): Logger {
  return {
    trace: (o, m) => l.trace(o, m),
    debug: (o, m) => l.debug(o, m),
    info: (o, m) => l.info(o, m),
    warn: (o, m) => l.warn(o, m),
    error: (o, m) => l.error(o, m),
    fatal: (o, m) => l.fatal(o, m),
    child: (b) => wrap(l.child(b as Record<string, unknown>)),
  };
}

/** Truncate a wallet address to its first 6 and last 4 chars for log hygiene. */
export function walletMask(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Truncate a nonce to the first 8 chars for log correlation. */
export function nonceMask(nonce: string): string {
  return nonce.length <= 8 ? nonce : `${nonce.slice(0, 8)}…`;
}
