import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'auth_token';
// Next to the access token on purpose: the renderer needs it in plain text to call
// refreshSession, so Electron safeStorage would only add encryption at rest (and none on
// Linux without a keyring). See docs/api/authentication.md.
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
// The exchange of the current refresh token keeps one id until it succeeds: when an answer is
// lost, the backend recognises the repeat and returns the same tokens instead of seeing reuse.
const REFRESH_ATTEMPT_KEY = 'auth_refresh_attempt';
// Refresh tokens of signed-out sessions whose revocation the backend has not confirmed yet.
const PENDING_LOGOUTS_KEY = 'auth_pending_logouts';
type TokenListener = (token: string | null) => void;

export type AuthSession = {
  token: string;
  refreshToken: string;
};

class TokenService {
  private listeners = new Set<TokenListener>();
  private sessionExpired = false;
  // Changes on every sign-in and sign-out, not on a token refresh: work started for one session
  // (a refresh, a retried request) must not touch the next one.
  private generation = 0;

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  getGeneration() {
    return this.generation;
  }

  /** The id of the exchange of the current refresh token; the same until the exchange succeeds. */
  getRefreshAttemptId(): string {
    const stored = localStorage.getItem(REFRESH_ATTEMPT_KEY);
    if (stored) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const attemptId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(REFRESH_ATTEMPT_KEY, attemptId);
    return attemptId;
  }

  getPendingLogouts(): string[] {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(PENDING_LOGOUTS_KEY) ?? '[]');
      return Array.isArray(stored) ? stored.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }

  addPendingLogout(refreshToken: string) {
    const pending = this.getPendingLogouts().filter((token) => token !== refreshToken);
    this.storePendingLogouts([...pending, refreshToken]);
  }

  removePendingLogout(refreshToken: string) {
    this.storePendingLogouts(this.getPendingLogouts().filter((token) => token !== refreshToken));
  }

  /** A sign-in: starts a new session. */
  setSession(session: AuthSession) {
    this.generation += 1;
    this.sessionExpired = false;
    this.store(session);
  }

  /** A refresh: the same session with rotated tokens. */
  replaceTokens(session: AuthSession) {
    this.store(session);
  }

  clearToken() {
    this.generation += 1;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_ATTEMPT_KEY);
    this.notify(null);
  }

  /** Clears the session that could not be refreshed; the login page then explains why. */
  expireSession() {
    this.sessionExpired = true;
    this.clearToken();
  }

  isSessionExpired() {
    return this.sessionExpired;
  }

  subscribe(listener: TokenListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private store({ token, refreshToken }: AuthSession) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    // A new refresh token gets its own exchange.
    localStorage.removeItem(REFRESH_ATTEMPT_KEY);
    this.notify(token);
  }

  private storePendingLogouts(pending: string[]) {
    if (pending.length) localStorage.setItem(PENDING_LOGOUTS_KEY, JSON.stringify(pending));
    else localStorage.removeItem(PENDING_LOGOUTS_KEY);
  }

  private notify(token: string | null) {
    this.listeners.forEach((listener) => listener(token));
  }
}

export const tokenService = new TokenService();

export function useAuthToken() {
  return useSyncExternalStore(
    (listener) => tokenService.subscribe(listener),
    () => tokenService.getToken(),
    () => tokenService.getToken()
  );
}

export function useSessionExpired() {
  return useSyncExternalStore(
    (listener) => tokenService.subscribe(listener),
    () => tokenService.isSessionExpired(),
    () => tokenService.isSessionExpired()
  );
}
