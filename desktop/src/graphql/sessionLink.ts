import { ApolloLink, Observable, type FetchResult } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
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
 * is sent) passes the original errors on. A refresh that cannot reach the backend ends the
 * operation with that network error instead, so the user sees the connection problem.
 *
 * A plain link rather than `onError`: the `onError` of Apollo Client 3 does not unsubscribe from
 * the retry it starts, so an operation canceled during the refresh would still be sent again.
 */
export const createSessionLink = (refresh: typeof refreshSession = refreshSession) =>
  new ApolloLink(
    (operation, forward) =>
      new Observable<FetchResult>((observer) => {
        let retry: { unsubscribe: () => void } | undefined;
        // Set when the caller unsubscribes, possibly while the refresh is still pending.
        let canceled = false;
        // The first answer was UNAUTHENTICATED: the refresh or the retry ends the operation.
        let refreshing = false;

        const refreshAndRetry = (response: FetchResult) => {
          const context = operation.getContext() as OperationContext;
          const passOn = () => {
            observer.next(response);
            observer.complete();
          };
          refresh(context.sessionGeneration, context.sessionToken).then(
            (outcome) => {
              // Nobody waits for the result any more: a canceled mutation must not be sent again.
              if (canceled) return;
              if (outcome !== 'refreshed') return passOn();
              // sessionGeneration stays as the first attempt set it: the auth link checks it.
              operation.setContext({ [RETRIED]: true });
              retry = forward(operation).subscribe({
                next: (result) => observer.next(result),
                error: (error) =>
                  error instanceof SessionChangedError ? passOn() : observer.error(error),
                complete: () => observer.complete(),
              });
            },
            (error) => {
              if (!canceled) observer.error(error);
            }
          );
        };

        const first = forward(operation).subscribe({
          next: (result) => {
            const context = operation.getContext() as OperationContext;
            if (isUnauthenticated(result.errors) && !context[RETRIED]) {
              refreshing = true;
              refreshAndRetry(result);
              return;
            }
            observer.next(result);
          },
          error: (error) => observer.error(error),
          complete: () => {
            if (!refreshing) observer.complete();
          },
        });

        return () => {
          canceled = true;
          first.unsubscribe();
          retry?.unsubscribe();
        };
      })
  );
