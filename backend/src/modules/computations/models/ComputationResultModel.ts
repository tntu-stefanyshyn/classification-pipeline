import { getModelForClass } from '@typegoose/typegoose';
import { ComputationResult } from '../classes/ComputationResult';

export const computationResultsCollectionName = 'computation_results';

export const ComputationResultModel = getModelForClass(ComputationResult, {
  schemaOptions: { collection: computationResultsCollectionName, timestamps: true },
});
