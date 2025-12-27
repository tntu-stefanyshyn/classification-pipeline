import { registerEnumType } from 'type-graphql';

export enum ComputationQueue {
  local = 'local',
  cloud = 'cloud',
}

registerEnumType(ComputationQueue, { name: 'ComputationQueue' });

export const COMPUTATION_QUEUE_VALUES: ComputationQueue[] = [
  ComputationQueue.local,
  ComputationQueue.cloud,
];
