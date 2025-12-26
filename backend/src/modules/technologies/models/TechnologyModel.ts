import { getModelForClass } from '@typegoose/typegoose';
import { Technology } from '../classes/Technology';

export const TechnologyModel = getModelForClass(Technology);
