import { getModelForClass } from '@typegoose/typegoose';
import { GraphStructure } from '../classes/GraphStructure';

export const graphStructuresCollectionName = 'graph_structures';

export const GraphStructureModel = getModelForClass(GraphStructure, {
  schemaOptions: { collection: graphStructuresCollectionName },
});
