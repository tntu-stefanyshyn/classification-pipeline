// `extensions.code` of the auth errors, so clients decide on the code, not on the message.

/** No, an invalid or an expired credential: the client refreshes the session or signs in. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';
