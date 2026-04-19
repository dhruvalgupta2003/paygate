import { z } from 'zod';

/**
 * Zod-validated environment.  Startup fails fast if any required value is
 * missing or malformed.  No defaults are applied silently for secrets.
 */

const commaList = z
  .string()
  .transform((raw) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  )
  .pipe(z.array(z.string()));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  PORT: z.coerce.number().int().min(1).max(65535).default(4020),
  HOST: z.string().default('0.0.0.0'),

  LIMEN_DATABASE_URL: z.string().url(),
  LIMEN_REDIS_URL: z.string().url(),

  LIMEN_JWT_SECRET: z
    .string()
    .min(32, 'LIMEN_JWT_SECRET must be at least 32 bytes; generate via `openssl rand -base64 48`'),

  LIMEN_DASHBOARD_URL: z.string().default('http://localhost:5173').transform((raw) =>
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  ),

  LIMEN_ADMIN_PUBKEY_ALLOWLIST: commaList.default(''),

  LIMEN_WEBHOOK_SIGNING_SECRET: z.string().min(32),
  LIMEN_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),

  LIMEN_API_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9464),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default('limen-api'),
  SENTRY_DSN: z.string().optional(),

  LIMEN_API_RATE_LIMIT_PER_SECOND: z.coerce.number().int().positive().default(60),
  LIMEN_API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(1000),

  LIMEN_AUDIT_DIR: z.string().default('./data/audit'),
  LIMEN_AUDIT_S3_BUCKET: z.string().optional(),
  LIMEN_AUDIT_S3_REGION: z.string().default('us-east-1'),

  LIMEN_API_ENABLE_DIRECTORY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  LIMEN_API_ENABLE_DSR: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid API environment:\n${issues}`);
  }
  return parsed.data;
}

export function getEnv(): Env {
  if (cached === undefined) cached = loadEnv();
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
