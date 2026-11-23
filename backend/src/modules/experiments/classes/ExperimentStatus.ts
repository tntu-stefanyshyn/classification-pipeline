import { registerEnumType } from 'type-graphql';

export enum ExperimentStatus {
  creating = 'creating',
  configuring = 'configuring',
  computing = 'computing',
  optimization = 'optimization',
  completed = 'completed',
}

registerEnumType(ExperimentStatus, {
  name: 'ExperimentStatus',
  description:
    'Status of an experiment. See the lifecycle page of the documentation for the allowed transitions.',
  valuesConfig: {
    creating: { description: 'Created; nothing configured yet.' },
    configuring: { description: 'The graph or its settings are being edited.' },
    computing: { description: 'The pipelines exist and are being computed. Editing is locked.' },
    optimization: { description: 'All pipelines are completed and the optimization is running.' },
    completed: { description: 'The optimization has finished.' },
  },
});

export const EXPERIMENT_STATUS_VALUES: ExperimentStatus[] = [
  ExperimentStatus.creating,
  ExperimentStatus.configuring,
  ExperimentStatus.computing,
  ExperimentStatus.optimization,
  ExperimentStatus.completed,
];
