import type { PathStatus } from '../ExperimentDetailsPage.types';
import { ComputationStatus, ExperimentStatus } from '../graphql';

export const runStatusLabels: Record<PathStatus, string> = {
  [ComputationStatus.queued]: 'Очікування',
  [ComputationStatus.running]: 'Обчислення',
  [ComputationStatus.paused]: 'Пауза',
  [ComputationStatus.completed]: 'Завершено',
  [ComputationStatus.failed]: 'Провалився',
  [ComputationStatus.stopped]: 'Зупинено',
  [ComputationStatus.idle]: 'Немає запусків',
};

export const experimentStatusLabels: Record<ExperimentStatus, string> = {
  [ExperimentStatus.creating]: 'Створення',
  [ExperimentStatus.configuring]: 'Налаштування',
  [ExperimentStatus.computing]: 'Обчислення',
  [ExperimentStatus.completed]: 'Завершено',
};

export const graphMetricLabels: Record<string, string> = {
  accuracy: 'Точність',
  f1: 'F1',
  rocAuc: 'ROC-AUC',
  ntps: 'NTPS',
};

export const runStatusColors: Record<PathStatus, string> = {
  queued: '#2563eb',
  running: '#f59e0b',
  failed: '#ef4444',
  completed: '#22c55e',
  stopped: '#f472b6',
  idle: '#cbd5e1',
  paused: '#a855f7',
};

export const runStatusPriority: Record<PathStatus, number> = {
  running: 1,
  queued: 2,
  failed: 3,
  stopped: 4,
  completed: 5,
  idle: 6,
  paused: 7,
};

export const statusLegendOrder: PathStatus[] = [
  ComputationStatus.queued,
  ComputationStatus.running,
  ComputationStatus.paused,
  ComputationStatus.failed,
  ComputationStatus.completed,
  ComputationStatus.stopped,
  ComputationStatus.idle,
];
