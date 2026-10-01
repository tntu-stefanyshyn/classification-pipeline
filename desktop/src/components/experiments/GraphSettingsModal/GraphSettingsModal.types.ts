import type {
  ComputationQueue,
  GraphStructureSettings,
  GraphStructureSettingsInput,
} from '../../../graphql/types.generated';

export type MetricKey = 'accuracy' | 'f1' | 'rocAuc' | 'ntps';

export type GraphSettingsDraft = {
  metrics: Record<MetricKey, string>;
  queues: ComputationQueue[];
  folds: number;
  hyperOptimizationMinutesPerPipeline: number;
  predictDataPercent: number;
};

export type GraphSettingsValidation = {
  isValid: boolean;
  errors: string[];
  sum: number;
  normalized: GraphStructureSettingsInput | null;
};

export type GraphSettingsModalProps = {
  open: boolean;
  settings?: GraphStructureSettings | null;
  onClose: () => void;
  onSave: (settings: GraphStructureSettingsInput) => void | Promise<void>;
  isBusy?: boolean;
  isLocked?: boolean;
  errorMessage?: string | null;
  title?: string;
};
