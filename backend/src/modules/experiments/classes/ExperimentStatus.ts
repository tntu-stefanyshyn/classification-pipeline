import { registerEnumType } from 'type-graphql';

export enum ExperimentStatus {
  queued = 'queued',
  running = 'running',
  failed = 'failed',
  completed = 'completed',
}

registerEnumType(ExperimentStatus, { name: 'ExperimentStatus' });

export const EXPERIMENT_STATUS_VALUES: ExperimentStatus[] = [
  ExperimentStatus.queued,
  ExperimentStatus.running,
  ExperimentStatus.failed,
  ExperimentStatus.completed,
];
