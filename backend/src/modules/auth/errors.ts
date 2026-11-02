import { GraphQLError } from 'graphql';

/** `extensions.code` of every authentication failure, so clients do not match message text. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

export const unauthenticated = (message = 'Not authenticated') =>
  new GraphQLError(message, { extensions: { code: UNAUTHENTICATED } });

/** The refresh token is unknown, expired, used or revoked: the client has to log in again. */
export const sessionExpired = () => unauthenticated('Session expired');
