/**
 * Limen Operator MCP server — HTTP entrypoint.
 *
 * Exposes the same MCP tool surface as the stdio binary over a
 * Streamable HTTP transport (MCP spec: single-endpoint Streamable HTTP).
 *
 * Auth modes (LIMEN_MCP_AUTH_MODE):
 *   - `none`           Open access. ONLY for local dev / loopback.
 *   - `static_bearer`  Single shared token (LIMEN_MCP_BEARER_TOKEN).
 *                      Easiest to wire for self-hosted single-tenant.
 *   - `oauth`          Full OAuth 2.1 with PKCE + Dynamic Client
 *                      Registration (RFC 7591) + RFC 8414 + the MCP-
 *                      spec protected-resource discovery.  This is what
 *                      Claude.com and other multi-tenant MCP clients
 *                      will reach for first.
 *
 * Default: `none` so you can boot quickly; switch in production.
 */

import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { buildOperatorMcpServer } from './server.js';
import { OAuthError, OAuthProvider } from './oauth.js';

type AuthMode = 'none' | 'static_bearer' | 'oauth';

interface HttpHostOptions {
  port?: number;
  host?: string;
  authMode?: AuthMode;
  staticBearer?: string;
  issuer?: string;
  jwtSecret?: string;
  defaultSubject?: string;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === 'true';
}

function loadOptions(): HttpHostOptions {
  const opts: HttpHostOptions = {
    port: Number(process.env['LIMEN_MCP_HTTP_PORT'] ?? 4030),
    host: process.env['LIMEN_MCP_HTTP_HOST'] ?? '0.0.0.0',
    authMode: (process.env['LIMEN_MCP_AUTH_MODE'] as AuthMode | undefined) ?? 'none',
  };
  const bearer = process.env['LIMEN_MCP_BEARER_TOKEN'];
  if (bearer !== undefined) opts.staticBearer = bearer;
  const issuer = process.env['LIMEN_MCP_ISSUER'];
  if (issuer !== undefined) opts.issuer = issuer;
  const jwt = process.env['LIMEN_MCP_JWT_SECRET'];
  if (jwt !== undefined) opts.jwtSecret = jwt;
  const sub = process.env['LIMEN_MCP_DEFAULT_SUBJECT'];
  if (sub !== undefined) opts.defaultSubject = sub;
  return opts;
}

// -------------------------------------------------------------------------
// Auth middlewares
// -------------------------------------------------------------------------

function staticBearerGuard(token: string): RequestHandler {
  const expected = Buffer.from(token, 'utf-8');
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header('authorization') ?? '';
    const provided = header.replace(/^Bearer\s+/i, '');
    const bytes = Buffer.from(provided, 'utf-8');
    if (
      bytes.length !== expected.length ||
      !timingSafeEqual(bytes, expected)
    ) {
      res
        .status(401)
        .header('WWW-Authenticate', 'Bearer realm="limen-mcp", error="invalid_token"')
        .json({ error: 'invalid_token' });
      return;
    }
    next();
  };
}

function oauthBearerGuard(provider: OAuthProvider): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization') ?? '';
    if (!header.toLowerCase().startsWith('bearer ')) {
      res
        .status(401)
        .header(
          'WWW-Authenticate',
          `Bearer realm="${provider.issuer}", resource_metadata="${provider.issuer}/.well-known/oauth-protected-resource"`,
        )
        .json({ error: 'invalid_token', error_description: 'missing bearer' });
      return;
    }
    const token = header.slice(7).trim();
    try {
      const payload = await provider.verifyAccessToken(token);
      (req as Request & { auth?: unknown }).auth = payload;
      next();
    } catch (err) {
      res
        .status(401)
        .header(
          'WWW-Authenticate',
          `Bearer realm="${provider.issuer}", error="invalid_token", error_description="${(err as Error).message}"`,
        )
        .json({ error: 'invalid_token', error_description: (err as Error).message });
    }
  };
}

// -------------------------------------------------------------------------
// OAuth route mounting
// -------------------------------------------------------------------------

function mountOAuthRoutes(app: express.Express, provider: OAuthProvider): void {
  // RFC 8414 — Authorization Server Metadata
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json(provider.authorizationServerMetadata());
  });

  // MCP spec — Protected Resource Metadata
  app.get('/.well-known/oauth-protected-resource', (_req, res) => {
    res.json(provider.protectedResourceMetadata());
  });

  // RFC 7591 — Dynamic Client Registration
  app.post('/register', async (req: Request, res: Response): Promise<void> => {
    try {
      const client = await provider.registerClient(req.body ?? {});
      res.status(201).json(client);
    } catch (err) {
      if (err instanceof OAuthError) {
        res.status(err.httpStatus).json(err.toEnvelope());
      } else {
        res.status(500).json({ error: 'server_error', error_description: (err as Error).message });
      }
    }
  });

  // Authorization endpoint — auto-approves and redirects when configured.
  app.get('/authorize', async (req: Request, res: Response): Promise<void> => {
    const q = req.query as Record<string, string | undefined>;
    try {
      const result = await provider.authorize({
        client_id: String(q.client_id ?? ''),
        redirect_uri: String(q.redirect_uri ?? ''),
        response_type: String(q.response_type ?? ''),
        code_challenge: String(q.code_challenge ?? ''),
        code_challenge_method: String(q.code_challenge_method ?? ''),
        ...(q.scope !== undefined ? { scope: q.scope } : {}),
        ...(q.state !== undefined ? { state: q.state } : {}),
      });
      res.redirect(302, result.redirectTo);
    } catch (err) {
      if (err instanceof OAuthError) {
        // OAuth errors during /authorize SHOULD redirect to redirect_uri
        // with error params when redirect_uri is valid.  For safety we
        // return JSON unless the URI clearly belongs to a known client.
        if (q.redirect_uri && q.client_id) {
          const client = await provider.getClient(String(q.client_id));
          if (client && client.redirect_uris.includes(String(q.redirect_uri))) {
            const u = new URL(String(q.redirect_uri));
            u.searchParams.set('error', err.code);
            u.searchParams.set('error_description', err.message);
            if (q.state) u.searchParams.set('state', String(q.state));
            res.redirect(302, u.toString());
            return;
          }
        }
        res.status(err.httpStatus).json(err.toEnvelope());
      } else {
        res.status(500).json({ error: 'server_error', error_description: (err as Error).message });
      }
    }
  });

  // Token endpoint — accepts form-encoded or JSON.
  app.post('/token', async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as Record<string, string | undefined>;
      const tokens = await provider.exchangeCode({
        grant_type: String(body.grant_type ?? ''),
        code: String(body.code ?? ''),
        redirect_uri: String(body.redirect_uri ?? ''),
        client_id: String(body.client_id ?? ''),
        ...(body.client_secret !== undefined ? { client_secret: body.client_secret } : {}),
        code_verifier: String(body.code_verifier ?? ''),
      });
      res.set('Cache-Control', 'no-store').json(tokens);
    } catch (err) {
      if (err instanceof OAuthError) {
        res.status(err.httpStatus).json(err.toEnvelope());
      } else {
        res.status(500).json({ error: 'server_error', error_description: (err as Error).message });
      }
    }
  });
}

// -------------------------------------------------------------------------
// MCP Streamable HTTP host
// -------------------------------------------------------------------------

interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

const sessions = new Map<string, SessionEntry>();

async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const sessionId = req.header('mcp-session-id');
  let entry = sessionId ? sessions.get(sessionId) : undefined;

  if (!entry) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        sessions.set(sid, { transport, server });
      },
    });
    (transport as unknown as { onclose: () => void }).onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    const server = buildOperatorMcpServer();
    // Cast through unknown: the SDK's Transport interface declares
    // optional event hooks as strictly-defined (no undefined) — viable
    // at runtime, but conflicts with our exactOptionalPropertyTypes.
    await server.connect(transport as unknown as Parameters<typeof server.connect>[0]);
    entry = { transport, server };
  }

  await entry.transport.handleRequest(req, res, req.body);
}

// -------------------------------------------------------------------------
// Bootstrap
// -------------------------------------------------------------------------

export async function startHttpHost(opts: HttpHostOptions = {}): Promise<{ close: () => void }> {
  const merged: Required<Omit<HttpHostOptions, 'staticBearer' | 'jwtSecret' | 'defaultSubject' | 'issuer'>> &
    Pick<HttpHostOptions, 'staticBearer' | 'jwtSecret' | 'defaultSubject' | 'issuer'> = {
    port: opts.port ?? loadOptions().port ?? 4030,
    host: opts.host ?? loadOptions().host ?? '0.0.0.0',
    authMode: opts.authMode ?? loadOptions().authMode ?? 'none',
    ...(opts.staticBearer !== undefined
      ? { staticBearer: opts.staticBearer }
      : loadOptions().staticBearer !== undefined
        ? { staticBearer: loadOptions().staticBearer }
        : {}),
    ...(opts.jwtSecret !== undefined
      ? { jwtSecret: opts.jwtSecret }
      : loadOptions().jwtSecret !== undefined
        ? { jwtSecret: loadOptions().jwtSecret }
        : {}),
    ...(opts.defaultSubject !== undefined
      ? { defaultSubject: opts.defaultSubject }
      : loadOptions().defaultSubject !== undefined
        ? { defaultSubject: loadOptions().defaultSubject }
        : {}),
    ...(opts.issuer !== undefined
      ? { issuer: opts.issuer }
      : loadOptions().issuer !== undefined
        ? { issuer: loadOptions().issuer }
        : {}),
  };

  const issuer = merged.issuer ?? `http://${merged.host}:${merged.port}`;
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true, authMode: merged.authMode });
  });

  let mcpGuard: RequestHandler;
  let oauthProvider: OAuthProvider | undefined;

  switch (merged.authMode) {
    case 'none':
      mcpGuard = (_req, _res, next) => next();
      // eslint-disable-next-line no-console
      console.error('[limen-mcp-operator-http] WARNING: authMode=none — open access');
      break;
    case 'static_bearer':
      if (!merged.staticBearer || merged.staticBearer.length < 16) {
        throw new Error(
          'static_bearer mode requires LIMEN_MCP_BEARER_TOKEN of at least 16 chars',
        );
      }
      mcpGuard = staticBearerGuard(merged.staticBearer);
      break;
    case 'oauth': {
      if (!merged.jwtSecret || merged.jwtSecret.length < 32) {
        throw new Error('oauth mode requires LIMEN_MCP_JWT_SECRET of at least 32 chars');
      }
      oauthProvider = new OAuthProvider({
        issuer,
        jwtSecret: merged.jwtSecret,
        autoApprove: envBool('LIMEN_MCP_OAUTH_AUTO_APPROVE', true),
        ...(merged.defaultSubject !== undefined ? { defaultSubject: merged.defaultSubject } : {}),
      });
      mountOAuthRoutes(app, oauthProvider);
      mcpGuard = oauthBearerGuard(oauthProvider);
      break;
    }
    default:
      throw new Error(`unknown authMode: ${merged.authMode}`);
  }

  // MCP endpoint — Streamable HTTP transport.  POST for client→server,
  // GET for SSE streaming (per MCP spec).
  app.post('/mcp', mcpGuard, async (req: Request, res: Response) => {
    try {
      await handleMcpRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'mcp_error', detail: (err as Error).message });
      }
    }
  });
  app.get('/mcp', mcpGuard, async (req: Request, res: Response) => {
    try {
      await handleMcpRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'mcp_error', detail: (err as Error).message });
      }
    }
  });
  app.delete('/mcp', mcpGuard, async (req: Request, res: Response) => {
    try {
      await handleMcpRequest(req, res);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ error: 'mcp_error', detail: (err as Error).message });
      }
    }
  });

  return new Promise((resolve) => {
    const httpServer = app.listen(merged.port, merged.host, () => {
      // eslint-disable-next-line no-console
      console.error(
        `[limen-mcp-operator-http] listening on http://${merged.host}:${merged.port} (auth=${merged.authMode})`,
      );
      resolve({
        close: () => {
          httpServer.close();
          for (const [, entry] of sessions) {
            void entry.transport.close();
          }
          sessions.clear();
        },
      });
    });
  });
}

// CLI entry — when run as a binary, boot from env.
if (
  process.argv[1] &&
  (process.argv[1].endsWith('http.js') || process.argv[1].endsWith('http.cjs'))
) {
  void startHttpHost().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('[limen-mcp-operator-http] fatal:', (err as Error).message);
    process.exit(1);
  });
}
