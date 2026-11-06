// `extensions.code` of the auth errors, so clients decide on the code, not on the message.

/** No, an invalid or an expired credential: the client refreshes the session or signs in. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

/** A login with a wrong email or password: shown on the form, never refreshes a session. */
export const INVALID_CREDENTIALS = 'INVALID_CREDENTIALS';
