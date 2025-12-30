import { registerEnumType } from 'type-graphql';
import { ExperimentStatus } from '../../../modules/experiments/classes/ExperimentStatus';
import { PipelineStatus } from '../../pipeline/enums';

export const workflowStatusEnum = [
  ...new Set([...Object.values(ExperimentStatus), ...Object.values(PipelineStatus)]),
];

export type WorkflowStatus = ExperimentStatus | PipelineStatus;

export enum WorkflowType {
  EXPERIMENT = 'EXPERIMENT',
  PIPELINE = 'PIPELINE',
}

registerEnumType(WorkflowType, { name: 'WorkflowType' });
