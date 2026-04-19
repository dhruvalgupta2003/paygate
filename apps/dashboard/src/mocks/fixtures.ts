import { faker } from '@faker-js/faker';
import type {
  Agent,
  AuditLogEntry,
  ComplianceEvent,
  DirectoryListing,
  Endpoint,
  Settings,
  Transaction,
  TxStatus,
  Webhook,
  WebhookDelivery,
} from '~/lib/schemas';
import { CHAIN_IDS, type ChainId } from '~/lib/chains';

faker.seed(402);

function randomChain(): ChainId {
  const pool = [...CHAIN_IDS];
  return faker.helpers.arrayElement(pool);
}

function randomWallet(chain: ChainId): string {
  if (chain === 'solana' || chain === 'solana-devnet') {
    return faker.string.alphanumeric({ length: 44, casing: 'mixed' });
  }
  return `0x${faker.string.hexadecimal({ length: 40, casing: 'lower', prefix: '' })}`;
}

function randomTxHash(chain: ChainId): string {
  if (chain === 'solana' || chain === 'solana-devnet') {
    return faker.string.alphanumeric({ length: 88 });
  }
  return `0x${faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' })}`;
}

const ENDPOINT_TEMPLATES: ReadonlyArray<{
  path: string;
  description: string;
  priceMicros: bigint;
  chains: ChainId[];
  tags: string[];
}> = [
  {
    path: '/api/v1/weather/:city',
    description: 'Hyperlocal weather and forecast',
    priceMicros: 1000n,
    chains: ['base', 'solana'],
    tags: ['data', 'weather'],
  },
  {
    path: '/api/v1/geocode/lookup',
    description: 'Geocode a postal address to lat/lng',
    priceMicros: 500n,
    chains: ['base', 'base-sepolia'],
    tags: ['data', 'maps'],
  },
  {
    path: '/api/v1/llm/summarise',
    description: 'Summarise a long-form article into 120 words',
    priceMicros: 50000n,
    chains: ['base'],
    tags: ['llm', 'premium'],
  },
  {
    path: '/api/v1/search/news',
    description: 'Real-time news search with entity tagging',
    priceMicros: 2500n,
    chains: ['base', 'solana'],
    tags: ['data', 'news'],
  },
  {
    path: '/api/v1/markets/quote/:symbol',
    description: 'Equity + crypto quotes, 15 min delayed',
    priceMicros: 1500n,
    chains: ['solana'],
    tags: ['markets'],
  },
  {
    path: '/api/v1/premium/research',
    description: 'Curated research reports, per-call billing',
    priceMicros: 100000n,
    chains: ['base'],
    tags: ['premium', 'docs'],
  },
  {
    path: '/api/v1/ocr/receipt',
    description: 'OCR receipt parser',
    priceMicros: 3000n,
    chains: ['base', 'solana'],
    tags: ['ml'],
  },
  {
    path: '/api/v1/embed/text',
    description: 'Text embeddings, 1536-dim',
    priceMicros: 200n,
    chains: ['solana'],
    tags: ['llm', 'cheap'],
  },
];

function buildEndpoint(template: (typeof ENDPOINT_TEMPLATES)[number], index: number): Endpoint {
  const requests7d = Array.from({ length: 7 }, () =>
    faker.number.int({ min: 80, max: 2800 }),
  );
  const total7d = requests7d.reduce((s, n) => s + n, 0);
  const revenueMicros =
    BigInt(total7d) * template.priceMicros;
  return {
    id: `end_${String(index).padStart(4, '0')}`,
    path_glob: template.path,
    method: 'ANY',
    description: template.description,
    price_usdc_micros: template.priceMicros.toString(),
    enabled: index !== 5,
    tags: template.tags,
    chains: template.chains,
    created_at: faker.date.past({ years: 0.5 }).toISOString(),
    requests_7d: requests7d,
    revenue_7d_micros: revenueMicros.toString(),
  };
}

export const MOCK_ENDPOINTS: Endpoint[] = ENDPOINT_TEMPLATES.map(buildEndpoint);

const ENDPOINT_MAP = new Map(MOCK_ENDPOINTS.map((e) => [e.id, e]));

function buildTransaction(i: number, now: Date): Transaction {
  const chain = randomChain();
  const endpoint = faker.helpers.arrayElement(MOCK_ENDPOINTS);
  const observedAt = new Date(
    now.getTime() - faker.number.int({ min: 0, max: 24 * 60 * 60 * 1000 }),
  );
  const status: TxStatus = faker.helpers.weightedArrayElement([
    { weight: 92, value: 'settled' },
    { weight: 4, value: 'pending' },
    { weight: 2, value: 'failed' },
    { weight: 1, value: 'refunded' },
    { weight: 1, value: 'reorged' },
  ]);
  return {
    id: `tx_${String(i).padStart(10, '0')}`,
    chain,
    tx_hash: randomTxHash(chain),
    block_or_slot: String(faker.number.int({ min: 12_000_000, max: 20_000_000 })),
    from_wallet: randomWallet(chain),
    to_wallet: randomWallet(chain),
    amount_usdc_micros: endpoint.price_usdc_micros,
    endpoint: endpoint.path_glob,
    endpoint_id: endpoint.id,
    status,
    observed_at: observedAt.toISOString(),
    settled_at:
      status === 'settled'
        ? new Date(observedAt.getTime() + 400 + Math.random() * 1200).toISOString()
        : null,
    verify_ms: faker.number.int({ min: 32, max: 420 }),
    nonce: `01${faker.string.alphanumeric({ length: 24, casing: 'upper' })}`,
  };
}

export const MOCK_TRANSACTIONS: Transaction[] = (() => {
  const now = new Date();
  const n = 620;
  const list: Transaction[] = [];
  for (let i = 0; i < n; i++) {
    list.push(buildTransaction(i, now));
  }
  list.sort((a, b) => (a.observed_at < b.observed_at ? 1 : -1));
  return list;
})();

function buildAgent(wallet: string, index: number): Agent {
  const chain = randomChain();
  const txs = MOCK_TRANSACTIONS.filter((t) => t.from_wallet === wallet);
  const spend = txs.reduce(
    (acc, t) => acc + BigInt(t.amount_usdc_micros),
    0n,
  );
  const endpointCounts = new Map<string, { r: number; m: bigint }>();
  for (const t of txs) {
    const cur = endpointCounts.get(t.endpoint) ?? { r: 0, m: 0n };
    endpointCounts.set(t.endpoint, {
      r: cur.r + 1,
      m: cur.m + BigInt(t.amount_usdc_micros),
    });
  }
  const top = [...endpointCounts.entries()]
    .sort((a, b) => b[1].r - a[1].r)
    .slice(0, 5)
    .map(([endpoint, v]) => ({
      endpoint,
      requests: v.r,
      revenue_usdc_micros: v.m.toString(),
    }));

  const heatmap = Array.from({ length: 168 }, () =>
    faker.number.int({ min: 0, max: 14 }),
  );

  return {
    wallet,
    label: index % 4 === 0 ? faker.company.name() + ' bot' : null,
    chain_preferred: chain,
    request_count: txs.length,
    spend_usdc_micros: spend.toString(),
    first_seen_at: faker.date.past({ years: 0.4 }).toISOString(),
    last_seen_at: txs[0]?.observed_at ?? new Date().toISOString(),
    top_endpoints: top,
    request_heatmap: heatmap,
  };
}

export const MOCK_AGENTS: Agent[] = (() => {
  const walletSet = new Set(MOCK_TRANSACTIONS.map((t) => t.from_wallet));
  const wallets = [...walletSet].slice(0, 48);
  return wallets
    .map((w, i) => buildAgent(w, i))
    .sort(
      (a, b) =>
        Number(BigInt(b.spend_usdc_micros) - BigInt(a.spend_usdc_micros)),
    );
})();

export const MOCK_WEBHOOKS: Webhook[] = [
  {
    id: 'hk_ops_prod',
    url: 'https://ops.example.com/limen/hook',
    events: ['payment.settled', 'compliance.blocked'],
    secret_last4: 'a3c1',
    created_at: faker.date.past({ years: 0.2 }).toISOString(),
    enabled: true,
    delivery_success_7d: 8210,
    delivery_failed_7d: 3,
  },
  {
    id: 'hk_analytics',
    url: 'https://analytics.example.com/ingest/limen',
    events: ['payment.settled', 'payment.refunded', 'payment.reorged'],
    secret_last4: '02ef',
    created_at: faker.date.past({ years: 0.1 }).toISOString(),
    enabled: true,
    delivery_success_7d: 8198,
    delivery_failed_7d: 17,
  },
  {
    id: 'hk_audit_s3',
    url: 'https://s3.us-east-1.amazonaws.com/ops-audit/limen',
    events: ['audit.appended'],
    secret_last4: '91ba',
    created_at: faker.date.past({ years: 0.05 }).toISOString(),
    enabled: false,
    delivery_success_7d: 0,
    delivery_failed_7d: 0,
  },
];

export const MOCK_WEBHOOK_DELIVERIES: WebhookDelivery[] = Array.from(
  { length: 72 },
  (_, i) => {
    const webhook = faker.helpers.arrayElement(MOCK_WEBHOOKS);
    const status: WebhookDelivery['status'] = faker.helpers.weightedArrayElement([
      { weight: 92, value: 'delivered' },
      { weight: 6, value: 'failed' },
      { weight: 2, value: 'pending' },
    ]);
    const enqueued = faker.date.recent({ days: 3 });
    return {
      id: `hkd_${String(i).padStart(6, '0')}`,
      webhook_id: webhook.id,
      event: faker.helpers.arrayElement(webhook.events),
      status,
      response_code:
        status === 'delivered' ? 200 : status === 'failed' ? 500 : null,
      attempt: status === 'failed' ? faker.number.int({ min: 1, max: 5 }) : 1,
      delivered_at:
        status === 'delivered'
          ? new Date(enqueued.getTime() + 220).toISOString()
          : null,
      enqueued_at: enqueued.toISOString(),
      duration_ms:
        status === 'delivered'
          ? faker.number.float({ min: 80, max: 420, fractionDigits: 1 })
          : 30000,
    };
  },
).sort((a, b) => (a.enqueued_at < b.enqueued_at ? 1 : -1));

export const MOCK_COMPLIANCE: ComplianceEvent[] = Array.from({ length: 38 }, (_, i) => {
  const kind = faker.helpers.arrayElement([
    'sanctions',
    'geo',
    'dsr',
    'travel_rule',
  ] as const);
  const chain = randomChain();
  return {
    id: `cmp_${String(i).padStart(6, '0')}`,
    kind,
    detail:
      kind === 'sanctions'
        ? 'Wallet matched OFAC SDN list'
        : kind === 'geo'
          ? 'IP geolocation matched blocked country'
          : kind === 'dsr'
            ? 'Data subject redaction processed'
            : 'Transaction exceeded travel-rule threshold',
    wallet: kind === 'sanctions' || kind === 'dsr' ? randomWallet(chain) : null,
    country: kind === 'geo' ? faker.location.countryCode() : null,
    chain,
    at: faker.date.recent({ days: 14 }).toISOString(),
    status: faker.helpers.arrayElement(['blocked', 'flagged', 'processed']),
  };
});

export const MOCK_AUDIT_LOG: AuditLogEntry[] = Array.from({ length: 140 }, (_, i) => {
  const prev = `0x${faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' })}`;
  const hash = `0x${faker.string.hexadecimal({ length: 64, casing: 'lower', prefix: '' })}`;
  return {
    id: `adt_${String(i).padStart(6, '0')}`,
    actor: faker.helpers.arrayElement([
      'admin@example.com',
      'ops-bot',
      'system',
      'webhook:hk_ops_prod',
    ]),
    action: faker.helpers.arrayElement([
      'endpoint.price_updated',
      'endpoint.enabled',
      'endpoint.disabled',
      'wallet.rotated',
      'secret.rotated',
      'config.reloaded',
      'refund.issued',
      'webhook.created',
    ]),
    target: faker.helpers.arrayElement(
      MOCK_ENDPOINTS.map((e) => e.id),
    ),
    meta: { source: 'dashboard' },
    chain_hash: hash,
    prev_hash: prev,
    at: faker.date.recent({ days: 30 }).toISOString(),
    verified: i !== 37, // planted anomaly for demo
  };
}).sort((a, b) => (a.at < b.at ? 1 : -1));

export const MOCK_DIRECTORY: DirectoryListing = {
  project: {
    slug: 'limen-demo',
    name: 'Limen Demo APIs',
    description:
      'Reference collection of x402-monetised APIs powered by Limen. Weather, geocode, embeddings, and premium research.',
    category: 'Data',
    homepage: 'https://limen.dev/demo',
    logo_url: '/logo.svg',
    tags: ['data', 'llm', 'markets'],
  },
  status: 'published',
  published_at: faker.date.past({ years: 0.3 }).toISOString(),
  traffic_30d: 482_300,
  endpoints_public: MOCK_ENDPOINTS.filter((e) => e.enabled).length,
};

export const MOCK_SETTINGS: Settings = {
  wallets: {
    base: '0x2BD3f0a87f8b6A98aC3e36bB1C3a04f1A5B6C7d2',
    'base-sepolia': '0x14a91b71A21b21a6B5b1cF55F20B1F44C9BdAE3A',
    solana: '9XeYFm3Yqk4c7xK7pFbjfM3bR6J8mRf1R2z1Qd5zQ6Q1',
    'solana-devnet': 'DEVMnzA1WgfMhX5t8n5D3CZsZ5cXkKmN9pAs4rT6Yw9P',
  },
  rpc_overrides: {
    base: null,
    'base-sepolia': null,
    solana: 'https://rpc.example.com/solana',
    'solana-devnet': null,
  },
  rate_limits: [
    { id: 'rl_wallet_default', scope: 'wallet', rps: 10, burst: 30, enabled: true },
    { id: 'rl_ip_default', scope: 'ip', rps: 60, burst: 120, enabled: true },
    { id: 'rl_endpoint_llm', scope: 'endpoint', rps: 4, burst: 8, enabled: true },
    { id: 'rl_global', scope: 'global', rps: 2000, burst: 4000, enabled: true },
  ],
  compliance: {
    sanctions_enabled: true,
    geo_enabled: true,
    blocked_countries: ['IR', 'KP', 'SY', 'CU'],
    travel_rule_threshold_usdc: '1000.000000',
  },
  admin_key_last_rotated_at: faker.date.past({ years: 0.1 }).toISOString(),
  environment: 'production',
};

export function getEndpointById(id: string): Endpoint | undefined {
  return ENDPOINT_MAP.get(id);
}
