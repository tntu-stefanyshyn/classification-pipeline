import { ComputationQueue } from '../../../../graphql/types.generated';
import { formatWeightPercent } from '../../../../utils/metricWeights';
import type {
  GraphSettingsDraft,
  GraphSettingsValidation,
  MetricKey,
} from '../GraphSettingsModal.types';
import type { GraphStructureSettings } from '../../../../graphql/types.generated';
import { metricKeys } from '../constants/labels';

export const buildSettingsDraft = (
  settings?: GraphStructureSettings | null
): GraphSettingsDraft => ({
  metrics: {
    accuracy: formatWeightPercent(settings?.metrics?.accuracy),
    f1: formatWeightPercent(settings?.metrics?.f1),
    rocAuc: formatWeightPercent(settings?.metrics?.rocAuc),
    ntps: formatWeightPercent(settings?.metrics?.ntps),
  },
  queues: settings?.queues?.length ? settings.queues : [ComputationQueue.cloud],
});

export const normalizeMetricInput = (value: string, fallback: string): string => {
  const normalized = value.replace(',', '.');
  if (normalized === '') return '';
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed > 100) return '100';
  if (parsed < 0) return '0';
  return normalized;
};

export const validateGraphSettings = (
  settingsDraft: GraphSettingsDraft | null
): GraphSettingsValidation => {
  if (!settingsDraft) {
    return { isValid: false, errors: [], sum: 0, normalized: null };
  }

  const errors: string[] = [];
  const parsedMetrics: Record<MetricKey, number> = {
    accuracy: Number.NaN,
    f1: Number.NaN,
    rocAuc: Number.NaN,
    ntps: Number.NaN,
  };
  metricKeys.forEach((key) => {
    const rawValue = settingsDraft.metrics[key].trim();
    parsedMetrics[key] = rawValue === '' ? Number.NaN : Number(rawValue);
  });

  const hasInvalidMetric = metricKeys.some((key) => {
    const value = parsedMetrics[key];
    return !Number.isFinite(value) || value < 0 || value > 100;
  });
  if (hasInvalidMetric) {
    errors.push('Заповніть усі ваги метрик значеннями від 0 до 100.');
  }

  const sum = metricKeys.reduce((total, key) => total + (parsedMetrics[key] ?? 0), 0);
  if (!hasInvalidMetric && Math.abs(sum - 100) > 0.01) {
    errors.push('Сума ваг має дорівнювати 100%.');
  }

  if (settingsDraft.queues.length === 0) {
    errors.push('Оберіть хоча б один тип обчислень.');
  }

  const normalizedMetrics: Record<MetricKey, number> = {
    accuracy: parsedMetrics.accuracy / 100,
    f1: parsedMetrics.f1 / 100,
    rocAuc: parsedMetrics.rocAuc / 100,
    ntps: parsedMetrics.ntps / 100,
  };

  return {
    isValid: errors.length === 0,
    errors,
    sum,
    normalized:
      errors.length === 0
        ? {
            metrics: normalizedMetrics,
            queues: settingsDraft.queues,
          }
        : null,
  };
};
