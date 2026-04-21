/**
 * Programmatic exports for embedding the operator MCP server in another
 * process (e.g. an HTTP host) without going through the stdio binary.
 */
export { LimenClient, LimenApiError } from './client.js';
export type { LimenClientConfig } from './client.js';
export { buildOperatorMcpServer } from './server.js';
export { registerOperatorTools } from './tools.js';
export {
  OAuthProvider,
  InMemoryOAuthStore,
  OAuthError,
} from './oauth.js';
export type {
  OAuthClient,
  AuthorizationCode,
  OAuthStore,
  OAuthProviderOptions,
} from './oauth.js';
export { startHttpHost } from './http.js';
