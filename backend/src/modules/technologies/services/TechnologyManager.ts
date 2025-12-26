import { ClassificationStage } from '../../experiments/classes/ClassificationStage';
import { Technology } from '../classes/Technology';
import { TechnologyModel } from '../models/TechnologyModel';

export class TechnologyManager {
  async list(): Promise<Technology[]> {
    return TechnologyModel.find().sort({ name: 1 }).lean<Technology>().exec();
  }

  async findByStage(stage: ClassificationStage): Promise<Technology[]> {
    return TechnologyModel.find({ stage }).sort({ name: 1 }).lean<Technology>().exec();
  }

  async findByStageAndName(stage: ClassificationStage, name: string): Promise<Technology | null> {
    return TechnologyModel.findOne({ stage, name }).lean<Technology>().exec();
  }
}
