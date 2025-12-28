export const formatTimeAgo = (value: string) => {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const hours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
  if (Number.isNaN(hours)) return '';
  if (hours < 24) return `${hours} год тому`;
  const days = Math.floor(hours / 24);
  return `${days} дн тому`;
};
