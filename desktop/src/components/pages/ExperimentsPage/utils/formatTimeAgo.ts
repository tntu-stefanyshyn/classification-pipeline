export const formatTimeAgo = (value: string | Date, locale: 'uk' | 'en' = 'uk') => {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const hours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
  if (Number.isNaN(hours)) return '';
  if (hours < 24) return locale === 'uk' ? `${hours} год тому` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return locale === 'uk' ? `${days} дн тому` : `${days} d ago`;
};
