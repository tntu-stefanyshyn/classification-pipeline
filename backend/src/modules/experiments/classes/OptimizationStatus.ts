import { registerEnumType } from 'type-graphql';

export enum OptimizationStatus {
  optimizing = 'optimizing',
  failed = 'failed',
  completed = 'completed',
}

registerEnumType(OptimizationStatus, {
  name: 'OptimizationStatus',
  description: 'Status of the optimization of an experiment.',
  valuesConfig: {
    optimizing: { description: 'The optimization is running.' },
    failed: { description: 'The optimization ended with an error.' },
    completed: { description: 'The optimization finished and the best pipeline is stored.' },
  },
});
