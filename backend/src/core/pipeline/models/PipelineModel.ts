import { getModelForClass } from '@typegoose/typegoose';

import { Pipeline } from '../classes/Pipeline';

export const pipelinesCollectionName = 'pipelines';

export const PipelineModel = getModelForClass(Pipeline, {
  schemaOptions: { collection: pipelinesCollectionName },
});
