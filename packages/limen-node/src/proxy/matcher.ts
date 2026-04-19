import type { EndpointConfig } from '../config.js';

export interface MatchedEndpoint {
  readonly endpoint: EndpointConfig;
  readonly priceMicros: bigint;
}

// Glob → regex.  Supports `**` (any path including slashes), `*` (segment),
// and `:param` placeholders.  First-match wins.
function globToRegex(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i++;
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === ':') {
      while (i < glob.length - 1 && /[A-Za-z0-9_]/.test(glob[i + 1]!)) i++;
      re += '[^/]+';
    } else {
      re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export interface CompiledMatcher {
  findMatch(path: string, method: string): MatchedEndpoint | undefined;
}

export function compileMatcher(
  endpoints: readonly EndpointConfig[],
  priceToMicros: (price: string) => bigint,
): CompiledMatcher {
  const compiled = endpoints.map((ep) => ({
    ep,
    regex: globToRegex(ep.path),
    methods: new Set((ep.method ?? []).map((m) => m.toUpperCase())),
    price: priceToMicros(ep.price_usdc ?? ep.price?.base_usdc ?? '0'),
  }));

  return {
    findMatch(path, method) {
      const mu = method.toUpperCase();
      for (const c of compiled) {
        if (c.methods.size > 0 && !c.methods.has(mu)) continue;
        if (c.regex.test(path)) {
          return { endpoint: c.ep, priceMicros: c.price };
        }
      }
      return undefined;
    },
  };
}
