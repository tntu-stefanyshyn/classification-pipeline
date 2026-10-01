import { registerEnumType } from 'type-graphql';

export enum ExperimentStatus {
  creating = 'creating',
  configuring = 'configuring',
  computing = 'computing',
  optimization = 'optimization',
  completed = 'completed',
}

registerEnumType(ExperimentStatus, { name: 'ExperimentStatus' });

export const EXPERIMENT_STATUS_VALUES: ExperimentStatus[] = [
  ExperimentStatus.creating,
  ExperimentStatus.configuring,
  ExperimentStatus.computing,
  ExperimentStatus.optimization,
  ExperimentStatus.completed,
];
