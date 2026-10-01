import { ComputationQueue } from '../../../../graphql/types.generated';
import type { MetricKey } from '../GraphSettingsModal.types';

export const metricKeys: MetricKey[] = ['accuracy', 'f1', 'rocAuc', 'ntps'];

export const queueOptions: ComputationQueue[] = [ComputationQueue.local, ComputationQueue.cloud];
