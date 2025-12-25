import { getModelForClass } from '@typegoose/typegoose';

import { Experiment } from '../classes/Experiment';

export const ExperimentModel = getModelForClass(Experiment);
