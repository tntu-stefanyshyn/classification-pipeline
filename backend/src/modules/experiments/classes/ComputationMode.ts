import { registerEnumType } from 'type-graphql';

export enum ComputationMode {
  local = 'local',
  cloud = 'cloud',
  both = 'both',
}

registerEnumType(ComputationMode, { name: 'ComputationMode' });

export const COMPUTATION_MODE_VALUES: ComputationMode[] = [
  ComputationMode.local,
  ComputationMode.cloud,
  ComputationMode.both,
];
