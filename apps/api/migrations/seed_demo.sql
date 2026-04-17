-- Seed a single project + endpoint + the real Base Sepolia settlement we
-- just completed.  Idempotent: safe to re-run.

INSERT INTO projects (id, slug, name, owner_wallet)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'demo-api',
  'demo-api',
  '0x046c883149e8C099B61e5BbF2Ff52024710385Fb'
)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO endpoints (id, project_id, path_glob, method, price_usdc_micros, tags, enabled, description)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  '/api/v1/weather/*',
  ARRAY['GET'],
  1000,
  ARRAY['weather', 'testnet-demo'],
  TRUE,
  'Per-city weather lookup — demo endpoint'
)
ON CONFLICT (id) DO UPDATE SET
  price_usdc_micros = EXCLUDED.price_usdc_micros,
  enabled           = EXCLUDED.enabled;

-- Real settled transactions from today's Base Sepolia round-trips.
-- Each one actually moved 0.001 USDC on-chain.
INSERT INTO transactions (
  id, project_id, endpoint_id, chain, tx_hash, block_or_slot,
  amount_usdc_micros, from_wallet, to_wallet, nonce,
  status, settled_at, observed_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000101',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    'base-sepolia',
    '0xbda2d3d3893940e6e504fb2d0c692e680fa9c55e4a0ff8c87245bedc4a021597',
    40345826,
    1000,
    '0x046c883149e8C099B61e5BbF2Ff52024710385Fb',
    '0x046c883149e8C099B61e5BbF2Ff52024710385Fb',
    '01KPEM6VX1JN0000000000000000000',
    'settled',
    NOW() - INTERVAL '10 minutes',
    NOW() - INTERVAL '10 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    'base-sepolia',
    '0x9b111a13fb10b04a9ddc558d4063bcdc1f478817023f68ebd8403fac1ad55cd7',
    40345899,
    1000,
    '0x046c883149e8C099B61e5BbF2Ff52024710385Fb',
    '0x046c883149e8C099B61e5BbF2Ff52024710385Fb',
    '01KPEMBBP21T0000000000000000000',
    'settled',
    NOW() - INTERVAL '8 minutes',
    NOW() - INTERVAL '8 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    'base-sepolia',
    '0xcf12408f3db360969398e09de4e830cd28ab7b078aa5dd7d3c799417118d8c13',
    40345944,
    1000,
    '0x046c883149e8C099B61e5BbF2Ff52024710385Fb',
    '0x046c883149e8C099B61e5BbF2Ff52024710385Fb',
    '01KPEME38W7C0000000000000000000',
    'settled',
    NOW() - INTERVAL '6 minutes',
    NOW() - INTERVAL '6 minutes'
  ),
  (
    '00000000-0000-0000-0000-000000000104',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    'base-sepolia',
    '0x98557afeebb3959e79d2f17563c78788ea1287ef11db2aab68e8eb7782e474f0',
    40346047,
    1000,
    '0x046c883149e8C099B61e5BbF2Ff52024710385Fb',
    '0x046c883149e8C099B61e5BbF2Ff52024710385Fb',
    '01KPEMMCBWYG0000000000000000000',
    'settled',
    NOW() - INTERVAL '4 minutes',
    NOW() - INTERVAL '4 minutes'
  )
ON CONFLICT (chain, tx_hash, observed_at) DO NOTHING;
