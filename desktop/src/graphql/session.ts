import { print, type DocumentNode, type GraphQLFormattedError } from 'graphql';
import { config } from '../config/config';
import { tokenService } from '../services/tokenService';
import { LogoutDocument, type LogoutMutationVariables } from './mutations/generated/logout';
import {
  RefreshSessionDocument,
  type RefreshSessionMutation,
  type RefreshSessionMutationVariables,
} from './mutations/generated/refreshSession';

/** `extensions.code` the backend sets on every authentication failure. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

export const isUnauthenticated = (errors?: readonly GraphQLFormattedError[]) =>
  Boolean(errors?.some((error) => error.extensions?.code === UNAUTHENTICATED));

/**
 * `expired`: the session is over and was cleared. `unavailable`: try again later, still signed in.
 * `superseded`: the user signed out or in meanwhile, so the result belongs to no current session.
 */
export type RefreshOutcome = 'refreshed' | 'expired' | 'unavailable' | 'superseded';

type OperationResult<TData> = { data?: TData | null; errors?: GraphQLFormattedError[] };

// Sent with fetch, outside the Apollo links: never retried, never with the expired access token.
const postOperation = async <TData, TVariables>(document: DocumentNode, variables: TVariables) => {
  const response = await fetch(config.renderer.graphqlEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: print(document), variables }),
  });
  return (await response.json()) as OperationResult<TData>;
};

const exchangeRefreshToken = async (generation: number): Promise<RefreshOutcome> => {
  const refreshToken = tokenService.getRefreshToken();
  if (!refreshToken) {
    // Tokens from before refresh tokens existed, or a session cleared elsewhere.
    tokenService.expireSession();
    return 'expired';
  }

  let result: OperationResult<RefreshSessionMutation>;
  try {
    result = await postOperation<RefreshSessionMutation, RefreshSessionMutationVariables>(
      RefreshSessionDocument,
      { refreshToken }
    );
  } catch {
    return 'unavailable';
  }

  // A late answer must not undo a sign-out or overwrite (or clear) a newer sign-in.
  if (tokenService.getGeneration() !== generation) return 'superseded';

  const session = result.data?.refreshSession;
  if (session) {
    tokenService.replaceTokens(session);
    return 'refreshed';
  }
  if (isUnauthenticated(result.errors)) {
    tokenService.expireSession();
    return 'expired';
  }
  return 'unavailable';
};

let pendingRefresh: { generation: number; promise: Promise<RefreshOutcome> } | null = null;

/**
 * Refreshes the session a request was sent in. `generation` and `failedToken` describe that
 * request; requests of one session that fail together share one refresh, because a refresh
 * token can be exchanged only once.
 */
export const refreshSession = (
  generation = tokenService.getGeneration(),
  failedToken?: string | null
): Promise<RefreshOutcome> => {
  if (generation !== tokenService.getGeneration()) return Promise.resolve('superseded');
  // Sent with an access token that has been refreshed since: the request only needs a retry.
  if (failedToken && failedToken !== tokenService.getToken()) return Promise.resolve('refreshed');

  if (pendingRefresh?.generation !== generation) {
    const promise = exchangeRefreshToken(generation).finally(() => {
      if (pendingRefresh?.promise === promise) pendingRefresh = null;
    });
    pendingRefresh = { generation, promise };
  }
  return pendingRefresh.promise;
};

/** Signs out locally at once, then asks the backend to revoke the session (best effort). */
export const endSession = async () => {
  const refreshToken = tokenService.getRefreshToken();
  tokenService.clearToken();
  if (!refreshToken) return;
  try {
    await postOperation<unknown, LogoutMutationVariables>(LogoutDocument, { refreshToken });
  } catch {
    // Offline: the refresh token simply expires on the server.
  }
};
