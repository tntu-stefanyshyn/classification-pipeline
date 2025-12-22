import { useSyncExternalStore } from 'react';

const TOKEN_KEY = 'auth_token';
type TokenListener = (token: string | null) => void;

class TokenService {
  private listeners = new Set<TokenListener>();

  getToken(): string | null {
    return 'token'; // TODO:  localStorage.getItem(TOKEN_KEY);
  }

  setToken(value: string) {
    localStorage.setItem(TOKEN_KEY, value);
    this.notify(value);
  }

  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    this.notify(null);
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
