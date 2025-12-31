import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { Pipeline } from '../classes/Pipeline';
import { PipelineModel } from '../models/PipelineModel';
import { UpdatePipelineInput } from '../classes/UpdatePipelineInput';
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

  async update({ pipelineId, progress, statusMessage }: UpdatePipelineInput): Promise<Pipeline> {
    const pipeline = await this.getById(pipelineId);
    // if (pipeline.status === PipelineStatus.paused) {
    //   return pipeline;
    // }

    await PipelineModel.updateOne(
      { _id: pipelineId },
      {
        $set: {
          ...(typeof progress === 'number' ? { progress } : {}),
          ...(statusMessage ? { statusMessage } : {}),
        },
        ...(statusMessage
          ? {
              $push: {
                history: {
                  createdAt: new Date(),
                  message: statusMessage,
                } satisfies PipelineHistoryItem,
              },
            }
          : {}),
      }
    ).lean();

    return this.getById(pipelineId);
  }
}

const PipelineBaseService = new PipelineBaseServiceClass();

export default PipelineBaseService;
