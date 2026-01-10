import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { Pipeline } from '../classes/Pipeline';
import { PipelineModel } from '../models/PipelineModel';
import { UpdatePipelineProgressInput } from '../classes/UpdatePipelineProgressInput';
import { UpdatePipelineOptimizationInput } from '../classes/UpdatePipelineOptimizationInput';
import { PipelineStatus } from '../enums';
import { PipelineHistoryItem } from '../classes/PipelineHistoryItem';
import { ObjectIdOrString } from '../../../types/context';

class PipelineBaseServiceClass {
  async listByExperiment(
    experimentId: ObjectIdOrString,
    queue?: ComputationQueue
  ): Promise<Pipeline[]> {
    return PipelineModel.find({ experimentId, ...(queue ? { queue } : {}) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async getById(pipelineId: ObjectIdOrString): Promise<Pipeline> {
    const pipeline = await PipelineModel.findById(pipelineId).lean();
    if (!pipeline) throw new Error('Шляху не знайдено');
    return pipeline;
  }

  async updatePipelineProgress({
    pipelineId,
    progress,
    message,
    status,
  }: UpdatePipelineProgressInput & { status?: PipelineStatus }): Promise<Pipeline> {
    await PipelineModel.updateOne(
      { _id: pipelineId },
      {
        $set: {
          ...(typeof progress === 'number' ? { progress } : {}),
        },
        ...(message || status
          ? {
              $push: {
                history: {
                  createdAt: new Date(),
                  message,
                  status,
                } satisfies PipelineHistoryItem,
              },
            }
          : {}),
      }
    ).lean();

    return this.getById(pipelineId);
  }

  async updatePipelineOptimization({
    pipelineId,
    score,
  }: UpdatePipelineOptimizationInput): Promise<Pipeline> {
    await PipelineModel.updateOne(
      { _id: pipelineId },
      {
        $push: { optimizationScores: score },
      }
    ).lean();

    return this.getById(pipelineId);
  }
}

const PipelineBaseService = new PipelineBaseServiceClass();

export default PipelineBaseService;
