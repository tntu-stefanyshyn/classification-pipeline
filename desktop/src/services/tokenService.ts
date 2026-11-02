import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'auth_token';
// Next to the access token on purpose: the renderer needs it in plain text to call
// refreshSession, so Electron safeStorage would only add encryption at rest (and none on
// Linux without a keyring). See docs/api/authentication.md.
const REFRESH_TOKEN_KEY = 'auth_refresh_token';
type TokenListener = (token: string | null) => void;

export type AuthSession = {
  token: string;
  refreshToken: string;
};

class TokenService {
  private listeners = new Set<TokenListener>();
  private sessionExpired = false;

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  setSession({ token, refreshToken }: AuthSession) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    this.sessionExpired = false;
    this.notify(token);
  }

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
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
