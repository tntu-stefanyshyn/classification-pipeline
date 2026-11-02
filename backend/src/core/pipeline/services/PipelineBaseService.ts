import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { Pipeline } from '../classes/Pipeline';
import { PipelineModel } from '../models/PipelineModel';
import { UpdatePipelineProgressInput } from '../classes/UpdatePipelineProgressInput';
import { UpdatePipelineOptimizationInput } from '../classes/UpdatePipelineOptimizationInput';
import { PipelineStatus } from '../enums';
import { PipelineHistoryItem } from '../classes/PipelineHistoryItem';
import { ObjectIdOrString } from '../../../types/context';
import { executionFilter } from '../executionFilter';
import { WorkflowManager } from '../../workflow/services/WorkflowManager';
import { WorkflowType } from '../../workflow/enums';

class PipelineBaseServiceClass {
  private readonly workflowManager = new WorkflowManager();

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
    if (!pipeline) throw new Error('Конвеєр не знайдено');
    return pipeline;
  }

  async updatePipelineProgress({
    pipelineId,
    progress,
    message,
    status,
    executionId,
  }: UpdatePipelineProgressInput & { status?: PipelineStatus }): Promise<Pipeline> {
    const filter = { _id: pipelineId, ...executionFilter(executionId) };
    // Workers send only a message, so the history entry takes the run's current status.
    const historyStatus = status ?? (message ? await this.getRunStatus(pipelineId) : undefined);

    // Progress of an execution that is no longer current matches nothing.
    await PipelineModel.updateOne(filter, {
      $set: {
        ...(typeof progress === 'number' ? { progress } : {}),
      },
      ...(message || historyStatus
        ? {
            $push: {
              history: {
                createdAt: new Date(),
                message,
                status: historyStatus,
              } satisfies PipelineHistoryItem,
            },
          }
        : {}),
    }).lean();

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

  private async getRunStatus(pipelineId: ObjectIdOrString): Promise<PipelineStatus> {
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: pipelineId,
      type: WorkflowType.PIPELINE,
    });
    return workflow.status as PipelineStatus;
  }
}

const PipelineBaseService = new PipelineBaseServiceClass();

export default PipelineBaseService;
