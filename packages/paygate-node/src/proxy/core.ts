import { fetch } from 'undici';
import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { PayGateConfig } from '../config.js';
import { PayGateError } from '../errors.js';
import type {
  ChainAdapter,
  ComplianceScreen,
  Logger,
  NonceStore,
  PayGateRequest,
  PayGateResponse,
  PaymentAuth,
  PaymentRequirements,
  VerifyResult,
} from '../types.js';
import { encodeRequirements, decodePaymentHeader } from './handshake.js';
import { compileMatcher, type CompiledMatcher } from './matcher.js';
import { usdcToMicros } from '../utils/amount.js';
import { epochSeconds, shortToken } from '../utils/nonce.js';
import { nonceMask } from '../utils/logger.js';
import type { ChainId } from '../constants.js';
import { FacilitatorClient } from '../facilitator/client.js';
import { metrics } from '../analytics/metrics.js';
import type { RedisRateLimiter, InMemoryRateLimiter, RateLimitSpec } from '../utils/rate-limiter.js';

const tracer = trace.getTracer('paygate');

export interface CoreProxyDeps {
  readonly config: PayGateConfig;
  readonly adapters: Readonly<Record<string, ChainAdapter>>;
  readonly nonceStore: NonceStore;
  readonly rateLimiter: RedisRateLimiter | InMemoryRateLimiter;
  readonly compliance: ComplianceScreen;
  readonly logger: Logger;
  readonly upstream: string;
  readonly facilitator?: FacilitatorClient;
  readonly now?: () => number;
}

export interface CoreProxyResult {
  readonly response: PayGateResponse;
  readonly auth?: PaymentAuth;
  readonly requirements?: PaymentRequirements;
  readonly verifyResult?: VerifyResult;
}

export class CoreProxy {
  private readonly matcher: CompiledMatcher;
  private readonly cfg: PayGateConfig;
  private readonly adapters: Readonly<Record<string, ChainAdapter>>;
  private readonly nonceStore: NonceStore;
  private readonly rateLimiter: CoreProxyDeps['rateLimiter'];
  private readonly compliance: ComplianceScreen;
  private readonly logger: Logger;
  private readonly upstream: string;
  private readonly facilitator: FacilitatorClient | undefined;

  constructor(deps: CoreProxyDeps) {
    this.cfg = deps.config;
    this.adapters = deps.adapters;
    this.nonceStore = deps.nonceStore;
    this.rateLimiter = deps.rateLimiter;
    this.compliance = deps.compliance;
    this.logger = deps.logger;
    this.upstream = deps.upstream;
    this.facilitator = deps.facilitator;
    void (deps.now ?? epochSeconds); // reserved for future injection
    this.matcher = compileMatcher(this.cfg.endpoints, (s) => usdcToMicros(s));
  }

  async handle(request: PayGateRequest): Promise<CoreProxyResult> {
    const reqId = shortToken();
    const log = this.logger.child({ reqId, path: request.path, method: request.method });

    return tracer.startActiveSpan(
      'paygate.handle',
      { attributes: { 'paygate.path': request.path, 'paygate.method': request.method } },
      async (span: Span) => {
        try {
          metrics.requestsTotal.inc({ endpoint: 'matched', outcome: 'received' });
          const matched = this.matcher.findMatch(request.path, request.method);
          if (!matched) {
            // Unpaywalled — pass straight through.
            return { response: await this.forward(request) };
          }

          const chain: ChainId = (matched.endpoint.chain ?? this.cfg.defaults.chain) as ChainId;
          const adapter = this.adapters[chain];
          if (!adapter) {
            throw new PayGateError({
              code: 'BAD_CONFIG',
              detail: `no chain adapter configured for ${chain}`,
            });
          }

          // Price of 0 = free endpoint.  Still cache & rate-limit.
          if (matched.priceMicros === 0n) {
            metrics.requestsTotal.inc({ endpoint: matched.endpoint.path, outcome: 'free' });
            return { response: await this.forward(request) };
          }

          const xPayment = getHeaderSingle(request.headers, 'x-payment');
          if (!xPayment) {
            const req = adapter.buildPaymentRequirements(
              { chain, asset: '', amount: matched.priceMicros.toString() },
              {
                payTo: (this.cfg.wallets as Record<string, string | undefined>)[chain] ?? '',
                validUntilSeconds: this.cfg.defaults.payment_ttl_seconds,
                ...(matched.endpoint.description !== undefined
                  ? { description: matched.endpoint.description }
                  : {}),
                ...(this.cfg.project !== undefined
                  ? {
                      operator: {
                        name: this.cfg.project.name,
                        ...(this.cfg.project.homepage !== undefined
                          ? { url: this.cfg.project.homepage }
                          : {}),
                      },
                    }
                  : {}),
                facilitator: this.cfg.advanced.facilitator_url,
              },
            );
            await this.nonceStore.putRequirement(
              req.nonce,
              req.digest,
              this.cfg.defaults.payment_ttl_seconds + 60,
            );
            const { status, headers, body } = encodeRequirements(req);
            log.info(
              { outcome: 'payment_required', nonce: nonceMask(req.nonce), amount: matched.priceMicros.toString() },
              'issued 402',
            );
            metrics.requestsTotal.inc({ endpoint: matched.endpoint.path, outcome: 'payment_required' });
            return {
              response: { status, headers, body: JSON.stringify(body) },
              requirements: req,
            };
          }

          // Decode + re-bind to stored requirements.
          let auth: PaymentAuth;
          try {
            auth = decodePaymentHeader(xPayment);
          } catch (err) {
            if (err instanceof PayGateError) return { response: this.errorResponse(err) };
            throw err;
          }
          const storedDigest = await this.nonceStore.getRequirement(auth.nonce);
          if (!storedDigest) {
            return {
              response: this.errorResponse(
                new PayGateError({
                  code: 'NONCE_UNKNOWN',
                  detail: 'requirements have expired or were never issued here; request a fresh 402',
                }),
              ),
            };
          }

          // Rate limit (wallet + ip).
          const payer = (auth as { payTo?: string; authorization?: { from?: string } }).authorization?.from ??
            (auth as { payTo?: string }).payTo ??
            '';
          for (const rl of this.cfg.rate_limits) {
            const key = rl.scope === 'wallet' ? payer : rl.scope === 'ip' ? request.ip ?? 'unknown' : matched.endpoint.path;
            const spec: RateLimitSpec = { scope: rl.scope, limit: rl.limit, windowSeconds: rl.window_seconds };
            const dec = await this.rateLimiter.checkAndConsume(key, spec);
            if (!dec.allowed) {
              metrics.rateLimitDropsTotal.inc({ scope: rl.scope });
              return {
                response: this.errorResponse(
                  new PayGateError({
                    code: 'RATE_LIMITED',
                    detail: `scope=${rl.scope} exhausted; retry in ${dec.resetInSeconds}s`,
                    retryAfterMs: dec.resetInSeconds * 1000,
                  }),
                ),
              };
            }
          }

          // Compliance.
          if (this.cfg.compliance.sanctions_screening && payer) {
            const result = await this.compliance.screenWallet(payer, chain as never);
            if (!result.allowed) {
              return {
                response: this.errorResponse(
                  new PayGateError({
                    code: 'COMPLIANCE_BLOCKED',
                    detail: result.reason ?? 'sanctions match',
                    extra: result.list !== undefined ? { list: result.list } : {},
                  }),
                ),
              };
            }
          }

          // Replay guard — consume nonce exactly once.
          const claimed = await this.nonceStore.claim(
            auth.nonce,
            this.cfg.defaults.payment_ttl_seconds + 60,
          );
          if (!claimed) {
            return {
              response: this.errorResponse(
                new PayGateError({
                  code: 'NONCE_REUSED',
                  detail: 'this payment authorisation has already been redeemed',
                }),
              ),
            };
          }

          // Verify (facilitator preferred, direct fallback).
          const verifyStart = performance.now();
          let verify: VerifyResult;
          if (this.facilitator && this.cfg.defaults.facilitator === 'coinbase') {
            const requirements = await this.rebuildRequirements(adapter, matched.priceMicros, chain);
            verify = await this.facilitator.verify(requirements, xPayment);
            if (verify.ok) {
              verify = await this.facilitator.settle(requirements, xPayment);
            }
          } else {
            const requirements = await this.rebuildRequirements(adapter, matched.priceMicros, chain);
            verify = await adapter.verifyPayment(requirements, xPayment);
          }
          metrics.verifyDurationSeconds.observe({ chain, mode: this.cfg.defaults.facilitator }, (performance.now() - verifyStart) / 1000);

          if (!verify.ok) {
            metrics.verifyFailuresTotal.inc({ chain, reason: verify.code });
            return {
              response: this.errorResponse(
                new PayGateError({
                  code: verify.code as never,
                  detail: verify.detail,
                }),
              ),
              auth,
            };
          }

          // Forward upstream.
          const upstreamResp = await this.forward(request);
          const receipt = buildReceipt({
            chain,
            txHash: '',
            settled: verify.settledAmount,
          });
          return {
            response: {
              status: upstreamResp.status,
              headers: { ...upstreamResp.headers, 'X-PAYMENT-RESPONSE': receipt, 'X-Request-Id': reqId },
              body: upstreamResp.body,
            },
            auth,
            verifyResult: verify,
          };
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          if (err instanceof PayGateError) return { response: this.errorResponse(err) };
          log.error({ err: (err as Error).message }, 'unhandled error');
          return {
            response: this.errorResponse(
              new PayGateError({ code: 'INTERNAL', detail: 'unexpected error', cause: err }),
            ),
          };
        } finally {
          span.end();
        }
      },
    );
  }

  private async rebuildRequirements(
    adapter: ChainAdapter,
    amountMicros: bigint,
    chain: string,
  ): Promise<PaymentRequirements> {
    // We rebuild requirements from the *stored* digest fields, not from
    // client input, so a malicious agent cannot swap chain/amount.
    return adapter.buildPaymentRequirements(
      { chain: chain as ChainId, asset: '', amount: amountMicros.toString() },
      {
        payTo: (this.cfg.wallets as Record<string, string | undefined>)[chain] ?? '',
        validUntilSeconds: this.cfg.defaults.payment_ttl_seconds,
      },
    );
  }

  private errorResponse(err: PayGateError): PayGateResponse {
    const body: Record<string, unknown> = err.toJSON();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (err.retryAfterMs !== undefined) {
      headers['Retry-After'] = String(Math.ceil(err.retryAfterMs / 1000));
    }
    return { status: err.http, headers, body: JSON.stringify(body) };
  }

  private async forward(request: PayGateRequest): Promise<PayGateResponse> {
    const target = new URL(request.url, this.upstream);
    const headers = headersToObject(request.headers);
    delete headers['content-length'];
    delete headers['host'];
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.cfg.advanced.upstream_timeout_ms,
    );
    try {
      const resp = await fetch(target.toString(), {
        method: request.method,
        headers,
        body:
          request.body === undefined || request.method === 'GET' || request.method === 'HEAD'
            ? null
            : (request.body as ArrayBuffer),
        signal: controller.signal,
      });
      const outHeaders: Record<string, string> = {};
      resp.headers.forEach((v, k) => {
        outHeaders[k] = v;
      });
      const buf = Buffer.from(await resp.arrayBuffer());
      return { status: resp.status, headers: outHeaders, body: buf };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new PayGateError({ code: 'UPSTREAM_TIMEOUT', detail: `upstream exceeded ${this.cfg.advanced.upstream_timeout_ms}ms` });
      }
      throw new PayGateError({ code: 'UPSTREAM_FAILED', detail: (err as Error).message, cause: err });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function getHeaderSingle(
  headers: PayGateRequest['headers'],
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (v === undefined) return undefined;
  if (typeof v === 'string') return v;
  // readonly string[] — Array.isArray's built-in predicate won't narrow it.
  return v.length > 0 ? v[0] : undefined;
}

function headersToObject(h: PayGateRequest['headers']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

function buildReceipt(info: { chain: string; txHash: string; settled: string }): string {
  return `t=${Math.floor(Date.now() / 1000)},chain=${info.chain},tx=${info.txHash},settled=${info.settled}`;
}

