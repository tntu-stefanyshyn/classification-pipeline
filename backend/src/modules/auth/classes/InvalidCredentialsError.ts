/**
 * The email or the password of a login is wrong. Unlike AuthenticationError it says nothing about
 * a session, so clients show it on the form instead of refreshing a session; the GraphQL layer
 * reports it with the INVALID_CREDENTIALS code.
 */
export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}
