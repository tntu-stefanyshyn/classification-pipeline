import { registerEnumType } from 'type-graphql';

export enum OptimizationStatus {
  optimizing = 'optimizing',
  failed = 'failed',
  completed = 'completed',
}

registerEnumType(OptimizationStatus, { name: 'OptimizationStatus' });
