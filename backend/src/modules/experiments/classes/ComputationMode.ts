import { registerEnumType } from 'type-graphql';

export enum ComputationMode {
  local = 'local',
  cloud = 'cloud',
  both = 'both',
}

registerEnumType(ComputationMode, {
  name: 'ComputationMode',
  description: "Which queues an experiment's graph allows.",
  valuesConfig: {
    local: { description: 'Only the `local` queue.' },
    cloud: { description: 'Only the `cloud` queue.' },
    both: { description: 'Both queues; the default.' },
  },
});

export const COMPUTATION_MODE_VALUES: ComputationMode[] = [
  ComputationMode.local,
  ComputationMode.cloud,
  ComputationMode.both,
];
