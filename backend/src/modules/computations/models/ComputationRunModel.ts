import { getModelForClass } from '@typegoose/typegoose';
import { ComputationRun } from '../classes/ComputationRun';

export const computationRunsCollectionName = 'computation_runs';

export const ComputationRunModel = getModelForClass(ComputationRun, {
  schemaOptions: { collection: computationRunsCollectionName, timestamps: true },
});
