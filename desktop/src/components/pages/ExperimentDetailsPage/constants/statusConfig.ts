import { PipelineStatus } from '../graphql';

export const graphMetricLabels: Record<string, string> = {
  accuracy: 'Точність',
  f1: 'F1',
  rocAuc: 'ROC-AUC',
  ntps: 'NTPS',
};

export const runStatusColors: Partial<Record<PipelineStatus, string>> = {
  queued: '#2563eb',
  running: '#f59e0b',
  completed: '#22c55e',
  idle: '#cbd5e1',
};

export const runStatusPriority: Partial<Record<PipelineStatus, number>> = {
  running: 1,
  queued: 2,
  completed: 3,
  idle: 4,
};

export const statusLegendOrder: PipelineStatus[] = [
  PipelineStatus.queued,
  PipelineStatus.running,
  PipelineStatus.completed,
  PipelineStatus.idle,
];
