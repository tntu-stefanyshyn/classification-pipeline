import type { AppLocale } from '../i18n';

const DISPLAY_NAME_SEPARATOR = ' / ';

export const getLocalizedTechnologyLabel = (
  value?: string | null,
  locale: AppLocale = 'uk'
): string => {
  const normalizedValue = value?.trim() ?? '';
  if (!normalizedValue) return '';

  const parts = normalizedValue.split(DISPLAY_NAME_SEPARATOR).map((part) => part.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return normalizedValue;
  }

  return locale === 'en' ? parts[0] : parts[1];
};
