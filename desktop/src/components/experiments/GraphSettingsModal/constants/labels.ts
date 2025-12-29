import { ComputationQueue } from '../../../../graphql/types.generated';
import type { MetricKey } from '../GraphSettingsModal.types';

export const metricKeys: MetricKey[] = ['accuracy', 'f1', 'rocAuc', 'ntps'];

export const metricLabels: Record<MetricKey, string> = {
  accuracy: 'Точність',
  f1: 'F1',
  rocAuc: 'ROC-AUC',
  ntps: 'NTPS',
};

export const queueLabels: Record<ComputationQueue, string> = {
  [ComputationQueue.local]: 'Локально',
  [ComputationQueue.cloud]: 'У хмарі',
};

export const queueOptions: ComputationQueue[] = [ComputationQueue.local, ComputationQueue.cloud];
