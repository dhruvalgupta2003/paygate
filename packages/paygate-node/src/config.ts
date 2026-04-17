import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ALL_CHAINS, DEFAULT_FACILITATOR_URL, DEFAULT_PAYMENT_TTL_SECONDS } from './constants.js';
import { PayGateError } from './errors.js';

// ---------------------------------------------------------------------------
// Config schema — the only thing allowed to coerce / migrate user input.
// ---------------------------------------------------------------------------

const hex40 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, 'Expected an EVM address (0x + 40 hex chars)');

// Solana base58 address: 32-44 chars, excluding l,I,O,0.
const solanaAddress = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Expected a Solana base58 address');

const priceUsdcString = z
  .union([z.string(), z.number()])
  .transform((value) => {
    const s = typeof value === 'number' ? value.toFixed(6) : value.trim();
    if (!/^\d+(\.\d{1,6})?$/.test(s)) {
      throw new Error(`price must be a non-negative decimal with ≤6 places, got ${JSON.stringify(value)}`);
    }
    return s;
  });

const chainEnum = z.enum(ALL_CHAINS as readonly [string, ...string[]]);

export const endpointSchema = z
  .object({
    path: z.string().min(1),
    method: z.array(z.string()).optional(),
    price_usdc: priceUsdcString.optional(),
    price: z
      .object({
        base_usdc: priceUsdcString,
        surge: z
          .object({
            header: z.string().optional(),
            query: z.string().optional(),
            values: z.record(z.number().positive()),
          })
          .optional(),
      })
      .optional(),
    chain: chainEnum.optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (e) => e.price_usdc !== undefined || e.price !== undefined,
    { message: 'endpoint must specify price_usdc or price' },
  );

export const configSchema = z.object({
  version: z.literal(1),
  project: z
    .object({
      name: z.string().min(1),
      slug: z
        .string()
        .regex(/^[a-z0-9][a-z0-9-]{2,62}[a-z0-9]$/, 'slug must be lowercase kebab-case 4-64 chars'),
      description: z.string().optional(),
      contact: z.string().email().optional(),
      homepage: z.string().url().optional(),
    })
    .optional(),
  wallets: z
    .object({
      base: hex40.optional(),
      'base-sepolia': hex40.optional(),
      solana: solanaAddress.optional(),
      'solana-devnet': solanaAddress.optional(),
    })
    .refine((w) => Object.values(w).some(Boolean), {
      message: 'at least one receiving wallet must be configured',
    }),
  defaults: z
    .object({
      chain: chainEnum.default('base'),
      currency: z.literal('USDC').default('USDC'),
      confirmations: z.union([z.number().int().nonnegative(), z.enum(['confirmed', 'finalized'])]).default(2),
      payment_ttl_seconds: z
        .number()
        .int()
        .min(30)
        .max(3600)
        .default(DEFAULT_PAYMENT_TTL_SECONDS),
      facilitator: z.enum(['coinbase', 'self']).default('coinbase'),
    })
    .default({}),
  endpoints: z.array(endpointSchema).default([]),
  cache: z
    .object({
      enabled: z.boolean().default(true),
      driver: z.enum(['redis', 'memory']).default('redis'),
      default_ttl_seconds: z.number().int().nonnegative().default(60),
      rules: z
        .array(
          z.object({
            path: z.string(),
            ttl_seconds: z.number().int().nonnegative(),
          }),
        )
        .default([]),
    })
    .default({}),
  rate_limits: z
    .array(
      z.object({
        scope: z.enum(['wallet', 'ip', 'endpoint', 'global']),
        limit: z.number().int().positive(),
        window_seconds: z.number().int().positive(),
      }),
    )
    .default([]),
  compliance: z
    .object({
      sanctions_screening: z.boolean().default(true),
      geo_blocklist: z.array(z.string().length(2)).default([]),
      travel_rule_threshold_usd: z.number().nonnegative().default(3000),
      travel_rule_webhook: z.string().url().optional(),
      blocklist_path: z.string().optional(),
    })
    .default({}),
  webhooks: z
    .array(
      z.object({
        url: z.string().url(),
        secret_env: z.string().min(1).optional(),
        secret: z.string().optional(),
        events: z.array(z.string()).min(1),
      }),
    )
    .default([]),
  discovery: z
    .object({
      listed: z.boolean().default(false),
      categories: z.array(z.string()).default([]),
      openapi_url: z.string().optional(),
      example_agent_prompt: z.string().optional(),
    })
    .default({}),
  advanced: z
    .object({
      upstream_timeout_ms: z.number().int().positive().default(15_000),
      verifier_timeout_ms: z.number().int().positive().default(4_000),
      max_request_body_mb: z.number().positive().default(5),
      trust_proxy: z.boolean().default(true),
      proxy_protocol: z.boolean().default(false),
      allow_free_tier: z
        .object({
          requests_per_day: z.number().int().positive().default(0),
        })
        .optional(),
      log_bodies: z.boolean().default(false),
      facilitator_url: z.string().url().default(DEFAULT_FACILITATOR_URL),
      facilitator_failover_seconds: z.number().int().nonnegative().default(300),
      solana: z
        .object({
          priority_fee_percentile: z.number().int().min(1).max(99).default(75),
          use_lookup_table: z.boolean().default(false),
          commitment_finalized_threshold_usd: z.number().nonnegative().default(100),
        })
        .default({}),
      base: z
        .object({
          gas_multiplier: z.number().positive().default(1.25),
          high_value_threshold_usd: z.number().nonnegative().default(1000),
        })
        .default({}),
    })
    .default({}),
});

export type PayGateConfig = z.infer<typeof configSchema>;
export type EndpointConfig = z.infer<typeof endpointSchema>;

export function loadConfigFromString(raw: string): PayGateConfig {
  const parsed = raw.trim().startsWith('{') ? JSON.parse(raw) : parseYaml(raw);
  return parseConfig(parsed);
}

export function loadConfigFromFile(path: string): PayGateConfig {
  const raw = readFileSync(path, 'utf-8');
  return loadConfigFromString(raw);
}

export function parseConfig(input: unknown): PayGateConfig {
  const result = configSchema.safeParse(input);
  if (!result.success) {
    throw new PayGateError({
      code: 'BAD_CONFIG',
      detail: `config validation failed: ${result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    });
  }
  return result.data;
}
