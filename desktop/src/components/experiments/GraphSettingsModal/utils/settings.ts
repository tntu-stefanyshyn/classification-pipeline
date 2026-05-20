import { ComputationQueue } from '../../../../graphql/types.generated';
import { formatWeightPercent } from '../../../../utils/metricWeights';
import { getMessages, localeService } from '../../../../i18n';
import type {
  GraphSettingsDraft,
  GraphSettingsValidation,
  MetricKey,
} from '../GraphSettingsModal.types';
import type { GraphStructureSettings } from '../../../../graphql/types.generated';
import { metricKeys } from '../constants/labels';

const DEFAULT_FOLDS = 5;
const MAX_FOLDS = 20;
const DEFAULT_HYPER_OPTIMIZATION_MINUTES_PER_PIPELINE = 30;
const DEFAULT_PREDICT_DATA_PERCENT = 20;

export const buildSettingsDraft = (
  settings?: GraphStructureSettings | null
): GraphSettingsDraft => ({
  metrics: {
    accuracy: formatWeightPercent(settings?.metrics?.accuracy),
    f1: formatWeightPercent(settings?.metrics?.f1),
    rocAuc: formatWeightPercent(settings?.metrics?.rocAuc),
    ntps: formatWeightPercent(settings?.metrics?.ntps),
  },
  queues: settings?.queues?.length ? settings.queues : [ComputationQueue.local],
  folds:
    typeof settings?.folds === 'number' && Number.isInteger(settings.folds) && settings.folds > 0
      ? settings.folds
      : DEFAULT_FOLDS,
  hyperOptimizationMinutesPerPipeline:
    typeof settings?.hyperOptimizationMinutesPerPipeline === 'number' &&
    Number.isInteger(settings.hyperOptimizationMinutesPerPipeline) &&
    settings.hyperOptimizationMinutesPerPipeline > 0
      ? settings.hyperOptimizationMinutesPerPipeline
      : DEFAULT_HYPER_OPTIMIZATION_MINUTES_PER_PIPELINE,
  predictDataPercent:
    typeof settings?.predictDataPercent === 'number' &&
    Number.isInteger(settings.predictDataPercent) &&
    settings.predictDataPercent >= 1 &&
    settings.predictDataPercent <= 99
      ? settings.predictDataPercent
      : DEFAULT_PREDICT_DATA_PERCENT,
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
  const { validation } = getMessages(localeService.getLocale()).graphSettings;
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
    errors.push(validation.metricsRange);
  }

  const sum = metricKeys.reduce((total, key) => total + (parsedMetrics[key] ?? 0), 0);
  if (!hasInvalidMetric && Math.abs(sum - 100) > 0.01) {
    errors.push(validation.metricsSum);
  }

  if (settingsDraft.queues.length === 0) {
    errors.push(validation.queues);
  }

  if (!Number.isInteger(settingsDraft.folds) || settingsDraft.folds < 1) {
    errors.push(validation.folds);
  }
  if (Number.isInteger(settingsDraft.folds) && settingsDraft.folds > MAX_FOLDS) {
    errors.push(`${validation.folds} ${MAX_FOLDS}.`);
  }

  if (
    !Number.isInteger(settingsDraft.hyperOptimizationMinutesPerPipeline) ||
    settingsDraft.hyperOptimizationMinutesPerPipeline < 1
  ) {
    errors.push(validation.optimizationMinutes);
  }

  if (
    !Number.isInteger(settingsDraft.predictDataPercent) ||
    settingsDraft.predictDataPercent < 1 ||
    settingsDraft.predictDataPercent > 99
  ) {
    errors.push(validation.predictPercent);
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
            folds: settingsDraft.folds,
            hyperOptimizationMinutesPerPipeline: settingsDraft.hyperOptimizationMinutesPerPipeline,
            predictDataPercent: settingsDraft.predictDataPercent,
          }
        : null,
  };
};
