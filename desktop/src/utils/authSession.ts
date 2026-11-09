import type { AuthSession } from '../services/tokenService';

type SessionPayload = { token?: string | null; refreshToken?: string | null } | null | undefined;

/** The session a login or a registration started, or null when the answer carries no tokens. */
export const toAuthSession = (payload: SessionPayload): AuthSession | null =>
  payload?.token && payload.refreshToken
    ? { token: payload.token, refreshToken: payload.refreshToken }
    : null;
