export const formatWeightPercent = (weight?: number | null, fractionDigits = 2): string => {
  if (!Number.isFinite(weight)) return '';
  const percent = (weight as number) * 100;
  const fixed = percent.toFixed(fractionDigits);
  return fixed.replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};
