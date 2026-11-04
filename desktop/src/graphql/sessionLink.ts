import { Observable } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import type { tokenService } from '../services/tokenService';
import { isUnauthenticated, refreshSession } from './session';

const RETRIED = 'sessionRetried';

/** Context the auth link sets on every operation: the session and access token it was sent with. */
export type SessionContext = { sessionGeneration?: number; sessionToken?: string | null };

type OperationContext = SessionContext & {
  headers?: Record<string, string>;
  [RETRIED]?: boolean;
};

/** Thrown by the auth link instead of sending a retry in a session other than its own. */
class SessionChangedError extends Error {
  constructor() {
    super('The session changed before the request was retried');
    this.name = 'SessionChangedError';
  }
}

/**
 * Sends the access token of the current session and records that session on the operation. A
 * retry stays in the session of its first attempt: if the user signed out or in since, it is not
 * sent at all, so a request of one account is never repeated with another account's token.
 */
export const createAuthLink = (tokens: Pick<typeof tokenService, 'getToken' | 'getGeneration'>) =>
  setContext((_, previous) => {
    const context = previous as OperationContext;
    const generation = tokens.getGeneration();
    // A retry still carries the session of its first attempt.
    if (context[RETRIED] && context.sessionGeneration !== generation) {
      throw new SessionChangedError();
    }
    const token = tokens.getToken();
    return {
      headers: { ...context.headers, authorization: token ? `Bearer ${token}` : '' },
      sessionGeneration: generation,
      sessionToken: token,
    };
  });

/**
 * On UNAUTHENTICATED, refreshes the session the operation was sent in and repeats the operation
 * once with the new access token (the auth link below reads it). A repeated failure, a session
 * that cannot be refreshed, or one that ended meanwhile (before the refresh or before the retry
 * is sent) passes the original errors on.
 */
export const createSessionLink = (refresh: typeof refreshSession = refreshSession) =>
  onError(({ graphQLErrors, operation, forward, response }) => {
    const context = operation.getContext() as OperationContext;
    if (!isUnauthenticated(graphQLErrors) || context[RETRIED]) return;

    return new Observable((observer) => {
      let subscription: { unsubscribe: () => void } | undefined;
      const passOn = () => {
        if (response) observer.next(response);
        observer.complete();
      };
      refresh(context.sessionGeneration, context.sessionToken).then(
        (outcome) => {
          if (outcome !== 'refreshed') return passOn();
          // sessionGeneration stays as the first attempt set it: the auth link checks it.
          operation.setContext({ [RETRIED]: true });
          subscription = forward(operation).subscribe({
            next: (result) => observer.next(result),
            error: (error) =>
              error instanceof SessionChangedError ? passOn() : observer.error(error),
            complete: () => observer.complete(),
          });
        },
        (error) => observer.error(error)
      );
      return () => subscription?.unsubscribe();
    });
  });
