import { registerEnumType } from 'type-graphql';

export enum ComputationStatus {
  queued = 'queued',
  running = 'running',
  paused = 'paused',
  failed = 'failed',
  completed = 'completed',
}

registerEnumType(ComputationStatus, { name: 'ComputationStatus' });

export const COMPUTATION_STATUS_VALUES: ComputationStatus[] = [
  ComputationStatus.queued,
  ComputationStatus.running,
  ComputationStatus.paused,
  ComputationStatus.failed,
  ComputationStatus.completed,
];
