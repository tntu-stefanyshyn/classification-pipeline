import { GraphQLError } from 'graphql';
import type { MiddlewareFn } from 'type-graphql';

import { AuthenticationError } from '../errors';

/** `extensions.code` of every authentication failure, so clients do not match message text. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

/** Global resolver middleware: maps the domain AuthenticationError to the GraphQL error code. */
export const reportAuthenticationErrors: MiddlewareFn = async (_action, next) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw new GraphQLError(error.message, {
        extensions: { code: UNAUTHENTICATED },
        originalError: error,
      });
    }
    throw error;
  }
};
