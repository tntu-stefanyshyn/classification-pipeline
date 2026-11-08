/**
 * Authentication failed: no, an invalid or an expired credential, or a user that no longer
 * exists. Services throw it without knowing the transport, so a caller can tell it from an
 * operational failure (the database is unavailable): only this one means "sign in again".
 */
export class AuthenticationError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'AuthenticationError';
  }
}
