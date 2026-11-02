import { Observable } from '@apollo/client';
import { onError } from '@apollo/client/link/error';
import { isUnauthenticated, refreshSession, type RefreshOutcome } from './session';

const RETRIED = 'sessionRetried';

/**
 * On UNAUTHENTICATED, refreshes the session once and repeats the operation with the new access
 * token (the auth link below reads it). A repeated failure, or a session that cannot be
 * refreshed, passes the original errors on.
 */
export const createSessionLink = (refresh: () => Promise<RefreshOutcome> = refreshSession) =>
  onError(({ graphQLErrors, operation, forward, response }) => {
    if (!isUnauthenticated(graphQLErrors) || operation.getContext()[RETRIED]) return;

    return new Observable((observer) => {
      let subscription: { unsubscribe: () => void } | undefined;
      refresh().then(
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
