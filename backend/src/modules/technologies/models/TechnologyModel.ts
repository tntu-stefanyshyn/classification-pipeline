import { getModelForClass } from '@typegoose/typegoose';
import { Technology } from '../classes/Technology';

export const technologiesCollectionName = 'technologies';

export const TechnologyModel = getModelForClass(Technology, {
  schemaOptions: { collection: technologiesCollectionName },
});
