import type { PathStatus } from '../ExperimentDetailsPage.types';
import { ComputationStatus, ExperimentStatus } from '../graphql';

export const runStatusLabels: Record<PathStatus, string> = {
  [ComputationStatus.queued]: 'Очікування',
  [ComputationStatus.running]: 'Обчислення',
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
  [ComputationStatus.queued]: '#2563eb',
  [ComputationStatus.running]: '#f59e0b',
  [ComputationStatus.failed]: '#ef4444',
  [ComputationStatus.completed]: '#22c55e',
  [ComputationStatus.stopped]: '#f472b6',
  [ComputationStatus.idle]: '#cbd5e1',
};

export const runStatusPriority: Record<PathStatus, number> = {
  [ComputationStatus.running]: 1,
  [ComputationStatus.queued]: 2,
  [ComputationStatus.failed]: 3,
  [ComputationStatus.stopped]: 4,
  [ComputationStatus.completed]: 5,
  [ComputationStatus.idle]: 6,
};

export const statusLegendOrder: PathStatus[] = [
  ComputationStatus.queued,
  ComputationStatus.running,
  ComputationStatus.failed,
  ComputationStatus.completed,
  ComputationStatus.stopped,
  ComputationStatus.idle,
];
