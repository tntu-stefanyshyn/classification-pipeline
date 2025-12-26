import { getModelForClass } from '@typegoose/typegoose';
import { GraphStructure } from '../classes/GraphStructure';

export const GraphStructureModel = getModelForClass(GraphStructure);
