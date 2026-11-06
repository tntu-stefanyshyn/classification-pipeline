/**
 * Authentication failed: no, an invalid or an expired credential. Services throw it without
 * knowing the transport; the GraphQL layer reports it with the UNAUTHENTICATED code
 * (see `graphql/reportAuthenticationErrors.ts`).
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
