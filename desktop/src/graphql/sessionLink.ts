import { Observable } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { isUnauthenticated, refreshSession } from './session';

const RETRIED = 'sessionRetried';

/** Context the auth link sets on every operation: the session and access token it was sent with. */
export type SessionContext = { sessionGeneration?: number; sessionToken?: string | null };

/**
 * On UNAUTHENTICATED, refreshes the session the operation was sent in and repeats the operation
 * once with the new access token (the auth link below reads it). A repeated failure, a session
 * that cannot be refreshed, or one that ended meanwhile passes the original errors on.
 */
export const createSessionLink = (refresh: typeof refreshSession = refreshSession) =>
  onError(({ graphQLErrors, operation, forward, response }) => {
    const context = operation.getContext() as SessionContext & { [RETRIED]?: boolean };
    if (!isUnauthenticated(graphQLErrors) || context[RETRIED]) return;

    return new Observable((observer) => {
      let subscription: { unsubscribe: () => void } | undefined;
      refresh(context.sessionGeneration, context.sessionToken).then(
        (outcome) => {
          if (outcome !== 'refreshed') {
            if (response) observer.next(response);
            observer.complete();
            return;
          }
          operation.setContext({ [RETRIED]: true });
          subscription = forward(operation).subscribe(observer);
        },
        (error) => observer.error(error)
      );
      return () => subscription?.unsubscribe();
    });
  });
