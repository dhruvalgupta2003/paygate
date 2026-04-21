/**
 * OAuth 2.1 + Dynamic Client Registration (RFC 7591) provider for the
 * Limen Operator MCP server's HTTP transport.
 *
 * Scope: minimum-viable OAuth 2.1 authorization-code-with-PKCE flow,
 * sufficient to satisfy MCP clients that follow the modelcontextprotocol
 * authentication spec (`oauth_2_1` discovery + DCR + bearer JWT).
 *
 * Storage: in-memory by default (clients, codes).  An operator running
 * a long-lived deployment should plug a Postgres-backed store via the
 * `OAuthProvider` constructor — see `OAuthStore` interface.  In-memory
 * is fine for self-hosted single-process deployments behind one TLS
 * terminator.
 *
 * What we DELIBERATELY skip in v1:
 *   - dynamic client deletion / rotation (DCR-only registration)
 *   - refresh tokens (use short-lived access tokens; re-DCR if needed)
 *   - device code flow (out of MCP-spec scope today)
 *   - encrypted-at-rest secret storage (operator's responsibility)
 *   - per-client rate-limit tracking (Express-level rate-limit suffices)
 */

import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

const TEN_MINUTES = 10 * 60 * 1000;

export interface OAuthClient {
  client_id: string;
  client_secret?: string; // Public clients (PKCE-only) MUST NOT have one.
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: 'none' | 'client_secret_basic' | 'client_secret_post';
  scope?: string;
  registered_at: number;
}

export interface AuthorizationCode {
  code: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  subject: string;
  expires_at: number;
  used: boolean;
}

export interface OAuthStore {
  saveClient(c: OAuthClient): Promise<void>;
  getClient(id: string): Promise<OAuthClient | null>;
  saveCode(c: AuthorizationCode): Promise<void>;
  getCode(code: string): Promise<AuthorizationCode | null>;
  markCodeUsed(code: string): Promise<void>;
}

export class InMemoryOAuthStore implements OAuthStore {
  private clients = new Map<string, OAuthClient>();
  private codes = new Map<string, AuthorizationCode>();

  async saveClient(c: OAuthClient): Promise<void> {
    this.clients.set(c.client_id, c);
  }
  async getClient(id: string): Promise<OAuthClient | null> {
    return this.clients.get(id) ?? null;
  }
  async saveCode(c: AuthorizationCode): Promise<void> {
    this.codes.set(c.code, c);
  }
  async getCode(code: string): Promise<AuthorizationCode | null> {
    const c = this.codes.get(code);
    if (!c) return null;
    if (c.expires_at < Date.now()) {
      this.codes.delete(code);
      return null;
    }
    return c;
  }
  async markCodeUsed(code: string): Promise<void> {
    const c = this.codes.get(code);
    if (c) {
      c.used = true;
      this.codes.set(code, c);
    }
  }
}

export interface OAuthProviderOptions {
  /** Externally-visible base URL of the MCP host (no trailing slash). */
  readonly issuer: string;
  /** HMAC secret used to sign access-token JWTs.  Min 32 bytes. */
  readonly jwtSecret: string;
  /** Issued access-token lifetime in seconds (default 3600). */
  readonly accessTokenTtlSec?: number;
  /** Backing store; defaults to in-memory. */
  readonly store?: OAuthStore;
  /**
   * Auto-approve every authorize request without a consent screen.
   * Reasonable default for MCP since the entire server is one resource;
   * set false to wire a real consent UI in the future.
   */
  readonly autoApprove?: boolean;
  /** Subject (`sub`) claim for auto-approved sessions. */
  readonly defaultSubject?: string;
}

export class OAuthProvider {
  readonly issuer: string;
  private readonly jwtSecret: Uint8Array;
  private readonly accessTokenTtlSec: number;
  private readonly store: OAuthStore;
  private readonly autoApprove: boolean;
  private readonly defaultSubject: string;

  constructor(opts: OAuthProviderOptions) {
    if (!opts.jwtSecret || opts.jwtSecret.length < 32) {
      throw new Error('OAuthProvider: jwtSecret must be at least 32 bytes');
    }
    this.issuer = opts.issuer.replace(/\/+$/, '');
    this.jwtSecret = new TextEncoder().encode(opts.jwtSecret);
    this.accessTokenTtlSec = opts.accessTokenTtlSec ?? 3600;
    this.store = opts.store ?? new InMemoryOAuthStore();
    this.autoApprove = opts.autoApprove ?? true;
    this.defaultSubject = opts.defaultSubject ?? 'mcp-operator';
  }

  // --- RFC 8414 metadata ---------------------------------------------------

  authorizationServerMetadata(): Record<string, unknown> {
    return {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/authorize`,
      token_endpoint: `${this.issuer}/token`,
      registration_endpoint: `${this.issuer}/register`,
      scopes_supported: ['mcp', 'mcp.read', 'mcp.write'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: [
        'none',
        'client_secret_basic',
        'client_secret_post',
      ],
      service_documentation: 'https://limen.dev/docs/mcp',
    };
  }

  // --- MCP-spec protected resource metadata --------------------------------

  protectedResourceMetadata(): Record<string, unknown> {
    return {
      resource: this.issuer,
      authorization_servers: [this.issuer],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp', 'mcp.read', 'mcp.write'],
      resource_documentation: 'https://limen.dev/docs/mcp',
    };
  }

  // --- RFC 7591 dynamic client registration --------------------------------

  async registerClient(input: {
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    response_types?: string[];
    token_endpoint_auth_method?: OAuthClient['token_endpoint_auth_method'];
    scope?: string;
  }): Promise<OAuthClient> {
    const redirect_uris = input.redirect_uris ?? [];
    if (redirect_uris.length === 0) {
      throw new OAuthError('invalid_redirect_uri', 'redirect_uris is required');
    }
    for (const uri of redirect_uris) {
      try {
        new URL(uri);
      } catch {
        throw new OAuthError('invalid_redirect_uri', `not a valid URL: ${uri}`);
      }
    }
    const authMethod = input.token_endpoint_auth_method ?? 'none';
    const grantTypes = input.grant_types ?? ['authorization_code'];
    if (!grantTypes.every((g) => g === 'authorization_code')) {
      throw new OAuthError(
        'invalid_client_metadata',
        'only authorization_code grant is supported',
      );
    }
    const responseTypes = input.response_types ?? ['code'];
    if (!responseTypes.every((r) => r === 'code')) {
      throw new OAuthError('invalid_client_metadata', 'only response_type=code is supported');
    }

    const client: OAuthClient = {
      client_id: `client_${randomToken(16)}`,
      client_name: input.client_name ?? 'Unnamed MCP client',
      redirect_uris,
      grant_types: grantTypes,
      response_types: responseTypes,
      token_endpoint_auth_method: authMethod,
      registered_at: Date.now(),
      ...(input.scope !== undefined ? { scope: input.scope } : {}),
    };
    if (authMethod !== 'none') {
      client.client_secret = randomToken(48);
    }
    await this.store.saveClient(client);
    return client;
  }

  async getClient(client_id: string): Promise<OAuthClient | null> {
    return this.store.getClient(client_id);
  }

  // --- Authorization endpoint ----------------------------------------------

  async authorize(input: {
    client_id: string;
    redirect_uri: string;
    response_type: string;
    code_challenge: string;
    code_challenge_method: string;
    scope?: string;
    state?: string;
  }): Promise<{ redirectTo: string }> {
    if (input.response_type !== 'code') {
      throw new OAuthError('unsupported_response_type', 'response_type must be `code`');
    }
    if (input.code_challenge_method !== 'S256') {
      throw new OAuthError(
        'invalid_request',
        'code_challenge_method must be S256 (PKCE required)',
      );
    }
    if (!input.code_challenge || input.code_challenge.length < 43) {
      throw new OAuthError(
        'invalid_request',
        'code_challenge must be a base64url-encoded SHA-256 (≥43 chars)',
      );
    }

    const client = await this.store.getClient(input.client_id);
    if (!client) {
      throw new OAuthError('invalid_client', `unknown client_id: ${input.client_id}`);
    }
    if (!client.redirect_uris.includes(input.redirect_uri)) {
      throw new OAuthError('invalid_redirect_uri', 'redirect_uri not registered for this client');
    }

    if (!this.autoApprove) {
      throw new OAuthError(
        'access_denied',
        'manual consent UI not implemented; set OAuthProvider({ autoApprove: true })',
      );
    }

    const code = randomToken(32);
    const ac: AuthorizationCode = {
      code,
      client_id: input.client_id,
      redirect_uri: input.redirect_uri,
      scope: input.scope ?? 'mcp',
      code_challenge: input.code_challenge,
      code_challenge_method: 'S256',
      subject: this.defaultSubject,
      expires_at: Date.now() + TEN_MINUTES,
      used: false,
    };
    await this.store.saveCode(ac);

    const url = new URL(input.redirect_uri);
    url.searchParams.set('code', code);
    if (input.state) url.searchParams.set('state', input.state);
    return { redirectTo: url.toString() };
  }

  // --- Token endpoint ------------------------------------------------------

  async exchangeCode(input: {
    grant_type: string;
    code: string;
    redirect_uri: string;
    client_id: string;
    client_secret?: string;
    code_verifier: string;
  }): Promise<{ access_token: string; token_type: 'Bearer'; expires_in: number; scope: string }> {
    if (input.grant_type !== 'authorization_code') {
      throw new OAuthError('unsupported_grant_type', 'only authorization_code is supported');
    }
    const client = await this.store.getClient(input.client_id);
    if (!client) throw new OAuthError('invalid_client', 'unknown client_id');
    if (client.token_endpoint_auth_method !== 'none') {
      if (
        !input.client_secret ||
        client.client_secret === undefined ||
        !timingSafeEq(input.client_secret, client.client_secret)
      ) {
        throw new OAuthError('invalid_client', 'client authentication failed');
      }
    }

    const ac = await this.store.getCode(input.code);
    if (!ac) throw new OAuthError('invalid_grant', 'unknown or expired authorization code');
    if (ac.used) throw new OAuthError('invalid_grant', 'authorization code already redeemed');
    if (ac.client_id !== input.client_id) {
      throw new OAuthError('invalid_grant', 'code was issued to a different client');
    }
    if (ac.redirect_uri !== input.redirect_uri) {
      throw new OAuthError('invalid_grant', 'redirect_uri mismatch');
    }

    // PKCE verification.
    const expectedChallenge = base64UrlEncode(
      createHash('sha256').update(input.code_verifier).digest(),
    );
    if (!timingSafeEq(expectedChallenge, ac.code_challenge)) {
      throw new OAuthError('invalid_grant', 'PKCE verifier did not match challenge');
    }

    await this.store.markCodeUsed(input.code);

    const access_token = await new SignJWT({ scope: ac.scope, client_id: client.client_id })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(this.issuer)
      .setAudience(this.issuer)
      .setSubject(ac.subject)
      .setIssuedAt()
      .setExpirationTime(`${this.accessTokenTtlSec}s`)
      .sign(this.jwtSecret);

    return {
      access_token,
      token_type: 'Bearer',
      expires_in: this.accessTokenTtlSec,
      scope: ac.scope,
    };
  }

  // --- Bearer token verification (used by the MCP route guard) -------------

  async verifyAccessToken(token: string): Promise<JWTPayload> {
    const { payload } = await jwtVerify(token, this.jwtSecret, {
      issuer: this.issuer,
      audience: this.issuer,
    });
    return payload;
  }
}

export class OAuthError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = 'OAuthError';
  }
  toEnvelope(): Record<string, string> {
    return { error: this.code, error_description: this.message };
  }
}

function randomToken(bytes: number): string {
  return base64UrlEncode(randomBytes(bytes));
}

function base64UrlEncode(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
