/**
 * Thin authenticated client for the Limen admin API.
 *
 * Reads `LIMEN_API_URL` (default `http://localhost:4020`) and
 * `LIMEN_API_KEY` (an `lk_<prefix>_<secret>` issued via the dashboard
 * /keys page or `POST /_limen/v1/keys`).  Every MCP tool funnels through
 * this so the LLM never sees raw fetch errors.
 */

const ADMIN_PREFIX = '/_limen/v1';

export interface LimenClientConfig {
  readonly apiUrl?: string;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
}

export class LimenApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'LimenApiError';
  }
}

export class LimenClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;

  constructor(cfg: LimenClientConfig = {}) {
    this.baseUrl = (cfg.apiUrl ?? process.env['LIMEN_API_URL'] ?? 'http://localhost:4020').replace(
      /\/+$/,
      '',
    );
    this.apiKey = cfg.apiKey ?? process.env['LIMEN_API_KEY'];
    this.timeoutMs = cfg.timeoutMs ?? 10_000;
  }

  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT',
    path: string,
    opts: { body?: unknown; query?: Record<string, unknown> } = {},
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${ADMIN_PREFIX}${path}`);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.apiKey) headers['authorization'] = `Bearer ${this.apiKey}`;
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      const init: RequestInit = { method, headers, signal: controller.signal };
      if (body !== undefined) init.body = body;
      res = await fetch(url.toString(), init);
    } catch (err) {
      throw new LimenApiError(
        0,
        'NETWORK',
        `network call to ${url.pathname} failed: ${(err as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }
    const isJson = (res.headers.get('content-type') ?? '').includes('json');
    const isEmpty =
      res.status === 204 || res.headers.get('content-length') === '0' || !isJson;
    const data = isEmpty ? undefined : await res.json();
    if (!res.ok) {
      const envelope = (data ?? {}) as { error?: string; detail?: string };
      throw new LimenApiError(
        res.status,
        envelope.error ?? 'UNKNOWN',
        envelope.detail ?? res.statusText,
        data,
      );
    }
    return data as T;
  }

  configSummary(): { apiUrl: string; hasKey: boolean } {
    return { apiUrl: this.baseUrl, hasKey: this.apiKey !== undefined };
  }
}
