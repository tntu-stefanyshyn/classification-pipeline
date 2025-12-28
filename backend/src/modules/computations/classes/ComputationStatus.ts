import { registerEnumType } from 'type-graphql';

export enum ComputationStatus {
  idle = 'idle',
  queued = 'queued',
  running = 'running',
  failed = 'failed',
  stopped = 'stopped',
  completed = 'completed',
}

registerEnumType(ComputationStatus, { name: 'ComputationStatus' });

export const COMPUTATION_STATUS_VALUES: ComputationStatus[] = [
  ComputationStatus.idle,
  ComputationStatus.queued,
  ComputationStatus.running,
  ComputationStatus.failed,
  ComputationStatus.stopped,
  ComputationStatus.completed,
];
