import { GraphQLError } from 'graphql';
import type { MiddlewareFn } from 'type-graphql';

import { AuthenticationError } from '../classes/AuthenticationError';
import { InvalidCredentialsError } from '../classes/InvalidCredentialsError';
import { INVALID_CREDENTIALS, UNAUTHENTICATED } from '../constants/errorCodes';

const codeOf = (error: unknown) => {
  if (error instanceof AuthenticationError) return UNAUTHENTICATED;
  if (error instanceof InvalidCredentialsError) return INVALID_CREDENTIALS;
  return null;
};

/** Global resolver middleware: maps the domain auth errors to their GraphQL error codes. */
export const reportAuthenticationErrors: MiddlewareFn = async (_action, next) => {
  try {
    return await next();
  } catch (error) {
    const code = codeOf(error);
    if (code && error instanceof Error) {
      throw new GraphQLError(error.message, { extensions: { code }, originalError: error });
    }
    throw error;
  }
};
