import { registerEnumType } from 'type-graphql';

export enum ComputationQueue {
  local = 'local',
  cloud = 'cloud',
}

registerEnumType(ComputationQueue, {
  name: 'ComputationQueue',
  description: 'Queue that decides which worker executes a pipeline.',
  valuesConfig: {
    local: { description: "Served by the desktop app's worker on the user's machine." },
    cloud: { description: "Served by the backend's Docker worker or by AWS Batch." },
  },
});

export const COMPUTATION_QUEUE_VALUES: ComputationQueue[] = [
  ComputationQueue.local,
  ComputationQueue.cloud,
];
