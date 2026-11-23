/**
 * Authentication failed: no, an invalid or an expired credential, or a user that no longer
 * exists. Services throw it without knowing the transport, so a caller can tell it from an
 * operational failure (the database is unavailable): only this one means "sign in again".
 * The GraphQL layer reports it with the UNAUTHENTICATED code
 * (see `graphql/reportAuthenticationErrors.ts`), the report endpoint with 401.
 */
export class AuthenticationError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'AuthenticationError';
  }

  /** The refresh token is unknown, expired, used or revoked: the client has to log in again. */
  static sessionExpired() {
    return new AuthenticationError('Session expired');
  }
}
