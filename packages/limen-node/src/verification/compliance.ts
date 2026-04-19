import { readFileSync } from 'node:fs';
import type { ComplianceDecision, ComplianceScreen } from '../types.js';
import type { ChainId } from '../constants.js';

/**
 * Compliance screen.  Three layers:
 *   1) Local blocklist (fastest, deterministic) — covers OFAC + local.
 *   2) Circle sanctions API (optional, slow path).
 *   3) Allowlist override (for trusted partners / internal testing).
 *
 * All lookups are case-insensitive; EVM addresses are compared
 * lowercased, Solana addresses as-is.
 */

export interface FileBlocklist {
  readonly addresses: ReadonlySet<string>;
  readonly source: string;
}

export function loadBlocklist(path: string): FileBlocklist {
  const text = readFileSync(path, 'utf-8');
  const parsed = JSON.parse(text) as { addresses: string[]; source?: string };
  const addresses = new Set(
    parsed.addresses.map((a) => (a.startsWith('0x') ? a.toLowerCase() : a.trim())),
  );
  return { addresses, source: parsed.source ?? path };
}

export interface DefaultComplianceOptions {
  readonly blocklist?: FileBlocklist | undefined;
  readonly allowlist?: ReadonlySet<string> | undefined;
  readonly geoBlocklist?: readonly string[] | undefined;
  readonly circleApiKey?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

export class DefaultComplianceScreen implements ComplianceScreen {
  private readonly blocklist: FileBlocklist | undefined;
  private readonly allowlist: ReadonlySet<string>;
  private readonly geo: ReadonlySet<string>;
  private readonly circleApiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: DefaultComplianceOptions = {}) {
    this.blocklist = opts.blocklist;
    this.allowlist = opts.allowlist ?? new Set();
    this.geo = new Set((opts.geoBlocklist ?? []).map((c) => c.toUpperCase()));
    this.circleApiKey = opts.circleApiKey;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  }

  async screenWallet(wallet: string, chain: ChainId): Promise<ComplianceDecision> {
    const key = chain.startsWith('base') ? wallet.toLowerCase() : wallet;
    if (this.allowlist.has(key)) return { allowed: true };
    if (this.blocklist && this.blocklist.addresses.has(key)) {
      return { allowed: false, reason: 'sanctions_list_match', list: this.blocklist.source };
    }
    if (this.circleApiKey && chain.startsWith('base')) {
      const dec = await this.circleLookup(key);
      if (!dec.allowed) return dec;
    }
    return { allowed: true };
  }

  async screenGeo(ipOrCountry: string): Promise<ComplianceDecision> {
    // Dev-only: accept country code directly.  In production, plug in
    // MaxMind / ipinfo at a higher layer and pass the ISO code here.
    const code = ipOrCountry.toUpperCase();
    if (code.length === 2 && this.geo.has(code)) {
      return { allowed: false, reason: 'geo_blocklist', list: 'geo' };
    }
    return { allowed: true };
  }

  private async circleLookup(address: string): Promise<ComplianceDecision> {
    try {
      const res = await this.fetchImpl('https://api.circle.com/v1/w3s/compliance/screen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.circleApiKey}`,
        },
        body: JSON.stringify({ address, blockchain: 'BASE' }),
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) return { allowed: true };
      const body = (await res.json()) as { data?: { result?: string; matches?: string[] } };
      if (body.data?.result === 'APPROVED') return { allowed: true };
      return {
        allowed: false,
        reason: `circle_${body.data?.result ?? 'denied'}`,
        list: 'circle',
      };
    } catch {
      // On screening failure, fail-closed only if we have a strict policy;
      // by default we fall through and let local lists enforce.  Operators
      // can flip this via a config toggle in a future release.
      return { allowed: true };
    }
  }
}

export class NullComplianceScreen implements ComplianceScreen {
  async screenWallet(): Promise<ComplianceDecision> {
    return { allowed: true };
  }
  async screenGeo(): Promise<ComplianceDecision> {
    return { allowed: true };
  }
}
