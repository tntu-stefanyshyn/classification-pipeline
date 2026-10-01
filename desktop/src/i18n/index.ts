import { useSyncExternalStore } from 'react';
import en, { type Messages } from './en';
import uk from './uk';

export type AppLocale = 'uk' | 'en';

const LOCALE_STORAGE_KEY = 'desktop_locale';
const translations: Record<AppLocale, Messages> = { uk, en };
const listeners = new Set<() => void>();

const inferBrowserLocale = (): AppLocale => {
  return 'uk';
};

const normalizeLocale = (value?: string | null): AppLocale => {
  if (value === 'uk' || value === 'en') return value;
  return inferBrowserLocale();
};

const readStoredLocale = () => {
  if (typeof localStorage === 'undefined') return inferBrowserLocale();
  try {
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return inferBrowserLocale();
  }
};

const applyDomLocale = (locale: AppLocale) => {
  if (typeof document === 'undefined' || !document.documentElement) return;
  document.documentElement.lang = locale;
};

let currentLocale: AppLocale = readStoredLocale();
applyDomLocale(currentLocale);

export const getMessages = (locale: AppLocale = currentLocale) => translations[locale];

export const localeService = {
  getLocale: () => currentLocale,
  setLocale: (nextLocale: AppLocale) => {
    if (currentLocale === nextLocale) return;
    currentLocale = nextLocale;
    applyDomLocale(currentLocale);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, currentLocale);
      } catch {
        // Ignore storage failures and keep the in-memory locale.
      }
    }
    listeners.forEach((listener) => listener());
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export const useLocale = () => {
  try {
    return useSyncExternalStore(
      localeService.subscribe,
      localeService.getLocale,
      localeService.getLocale
    );
  } catch {
    return localeService.getLocale();
  }
};

export const useI18n = () => {
  const locale = useLocale();
  return {
    locale,
    setLocale: localeService.setLocale,
    messages: getMessages(locale),
  };
};
