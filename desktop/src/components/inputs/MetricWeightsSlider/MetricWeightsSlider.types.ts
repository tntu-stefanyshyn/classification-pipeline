import type { MetricKey } from '../../experiments/GraphSettingsModal/GraphSettingsModal.types';

export type MetricWeightsSliderProps = {
  metrics: Record<MetricKey, string>;
  labels: Record<MetricKey, string>;
  metricKeys: MetricKey[];
  onChange: (nextMetrics: Record<MetricKey, string>) => void;
  disabled?: boolean;
};
