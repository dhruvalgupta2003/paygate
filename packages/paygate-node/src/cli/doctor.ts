import Redis from 'ioredis';
import { loadConfigFromFile } from '../config.js';
import { DEFAULT_FACILITATOR_URL, USDC_ADDRESSES } from '../constants.js';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { Connection } from '@solana/web3.js';
import { FacilitatorClient } from '../facilitator/client.js';

export interface DoctorOptions {
  readonly config: string;
}

export async function runDoctor(opts: DoctorOptions): Promise<boolean> {
  const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

  try {
    const cfg = loadConfigFromFile(opts.config);
    results.push({ name: 'config loaded', ok: true });

    if (cfg.wallets.base) {
      const ok = await rpcReachable(
        process.env['PAYGATE_BASE_RPC_URL'] ?? 'https://mainnet.base.org',
        'evm',
      );
      results.push({ name: 'base rpc', ok });
    }
    if (cfg.wallets.solana) {
      const ok = await rpcReachable(
        process.env['PAYGATE_SOLANA_RPC_URL'] ?? 'https://api.mainnet-beta.solana.com',
        'solana',
      );
      results.push({ name: 'solana rpc', ok });
    }

    if (process.env['PAYGATE_REDIS_URL']) {
      const ok = await redisReachable(process.env['PAYGATE_REDIS_URL']);
      results.push({ name: 'redis', ok });
    }

    if (cfg.defaults.facilitator === 'coinbase') {
      const client = new FacilitatorClient({
        url: cfg.advanced.facilitator_url ?? DEFAULT_FACILITATOR_URL,
      });
      results.push({ name: 'facilitator', ok: await client.health() });
    }
  } catch (err) {
    results.push({ name: 'config loaded', ok: false, detail: (err as Error).message });
  }

  const pad = Math.max(...results.map((r) => r.name.length));
  let allOk = true;
  for (const r of results) {
    const mark = r.ok ? '[ OK ]' : '[FAIL]';
    const row = `${mark}  ${r.name.padEnd(pad)}  ${r.detail ?? ''}`.trimEnd();
    console.log(row);
    if (!r.ok) allOk = false;
  }
  return allOk;
}

async function rpcReachable(url: string, kind: 'evm' | 'solana'): Promise<boolean> {
  try {
    if (kind === 'evm') {
      const client = createPublicClient({
        chain: url.includes('sepolia') ? baseSepolia : base,
        transport: http(url),
      });
      await client.getBlockNumber();
    } else {
      const conn = new Connection(url, 'confirmed');
      await conn.getSlot();
    }
    return true;
  } catch {
    return false;
  }
}

async function redisReachable(url: string): Promise<boolean> {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const pong = await redis.ping();
    await redis.quit();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

void USDC_ADDRESSES;
