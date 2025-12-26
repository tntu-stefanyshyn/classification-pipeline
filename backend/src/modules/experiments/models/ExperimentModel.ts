import { getModelForClass } from '@typegoose/typegoose';

import { Experiment } from '../classes/Experiment';

export const experimentsCollectionName = 'experiments';

export const ExperimentModel = getModelForClass(Experiment, {
  schemaOptions: { collection: experimentsCollectionName },
});
