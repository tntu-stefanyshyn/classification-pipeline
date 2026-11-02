import type { GraphQLFormattedError } from 'graphql';
import { config } from '../config/config';
import { tokenService, type AuthSession } from '../services/tokenService';

/** `extensions.code` the backend sets on every authentication failure. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

export const isUnauthenticated = (errors?: readonly GraphQLFormattedError[]) =>
  Boolean(errors?.some((error) => error.extensions?.code === UNAUTHENTICATED));

/** `expired`: the session is over and was cleared. `unavailable`: try again later, still signed in. */
export type RefreshOutcome = 'refreshed' | 'expired' | 'unavailable';

const REFRESH_SESSION = `mutation RefreshSession($refreshToken: String!) {
  refreshSession(refreshToken: $refreshToken) { token refreshToken }
}`;
const LOGOUT = `mutation Logout($refreshToken: String!) { logout(refreshToken: $refreshToken) }`;

type SessionResponse = {
  data?: { refreshSession?: AuthSession | null } | null;
  errors?: GraphQLFormattedError[];
};

// Sent with fetch, outside the Apollo links: never retried, never with the expired access token.
const postSessionOperation = async (query: string, refreshToken: string) => {
  const response = await fetch(config.renderer.graphqlEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables: { refreshToken } }),
  });
  return (await response.json()) as SessionResponse;
};

const exchangeRefreshToken = async (): Promise<RefreshOutcome> => {
  const refreshToken = tokenService.getRefreshToken();
  if (!refreshToken) {
    // Tokens from before refresh tokens existed, or a session cleared elsewhere.
    tokenService.expireSession();
    return 'expired';
  }

  let result: SessionResponse;
  try {
    result = await postSessionOperation(REFRESH_SESSION, refreshToken);
  } catch {
    return 'unavailable';
  }

  const session = result.data?.refreshSession;
  if (session) {
    tokenService.setSession(session);
    return 'refreshed';
  }
  if (isUnauthenticated(result.errors)) {
    tokenService.expireSession();
    return 'expired';
  }
  return 'unavailable';
};

let pendingRefresh: Promise<RefreshOutcome> | null = null;

/** Requests that fail together share one refresh: a refresh token can be exchanged only once. */
export const refreshSession = () => {
  pendingRefresh ??= exchangeRefreshToken().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
};

/** Signs out locally at once, then asks the backend to revoke the session (best effort). */
export const endSession = async () => {
  const refreshToken = tokenService.getRefreshToken();
  tokenService.clearToken();
  if (!refreshToken) return;
  try {
    await postSessionOperation(LOGOUT, refreshToken);
  } catch {
    // Offline: the refresh token simply expires on the server.
  }
};
