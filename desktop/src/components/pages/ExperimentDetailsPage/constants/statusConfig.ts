import { PipelineStatus } from '../graphql';

export const graphMetricLabels: Record<string, string> = {
  accuracy: 'Точність',
  f1: 'F1',
  rocAuc: 'ROC-AUC',
  ntps: 'NTPS',
};

export const runStatusColors: Record<PipelineStatus, string> = {
  queued: '#2563eb',
  running: '#f59e0b',
  failed: '#ef4444',
  completed: '#22c55e',
  stopped: '#f472b6',
  idle: '#cbd5e1',
  paused: '#a855f7',
};

export const runStatusPriority: Record<PipelineStatus, number> = {
  running: 1,
  queued: 2,
  failed: 3,
  stopped: 4,
  completed: 5,
  idle: 6,
  paused: 7,
};

export const statusLegendOrder: PipelineStatus[] = [
  PipelineStatus.queued,
  PipelineStatus.running,
  PipelineStatus.paused,
  PipelineStatus.failed,
  PipelineStatus.completed,
  PipelineStatus.stopped,
  PipelineStatus.idle,
];
