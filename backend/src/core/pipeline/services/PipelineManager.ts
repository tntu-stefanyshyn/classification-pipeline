import { Types } from 'mongoose';
import { GraphManager } from '../../../modules/experiments/services/GraphManager';
import { buildGraphPaths } from '../../../modules/experiments/utils/buildGraphPaths';
import { PipelineModel } from '../models/PipelineModel';
import { PipelineStatus } from '../enums';
import { Pipeline } from '../classes/Pipeline';
import { WorkflowManager } from '../../workflow/services/WorkflowManager';
import { WorkflowType } from '../../workflow/enums';
import { Transitions } from '../../workflow/services/WorkflowManager.types.';
import { ChangePipelineStatusInput } from '../classes/ChangePipelineStatusInput';
import { stringIdsToObjectIds, stringIdToObjectId } from '../../../utils';
import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';

const PIPELINE_STATUS_LOG_MESSAGES: Record<PipelineStatus, string> = {
  [PipelineStatus.idle]: 'Перехід у стан очікування',
  [PipelineStatus.queued]: 'Перехід у чергу',
  [PipelineStatus.running]: 'Початок обчислення',
  [PipelineStatus.completed]: 'Обчислення завершено',
};

export class PipelineManager {
  private readonly graphManager = new GraphManager();
  private readonly workflowManager = new WorkflowManager();

  async generatePipelinesFromGraphStructure(
    experimentId: Types.ObjectId | string
  ): Promise<Pipeline[]> {
    const graphStructure = await this.graphManager.getByExperimentId(experimentId);
    const queues = graphStructure.settings?.queues ?? [];

    const paths = buildGraphPaths(graphStructure.nodes);

    const results = await Promise.all(
      queues.map((queue) =>
        PipelineModel.create(
          paths.map((path) => {
            const pipeline: Partial<Pipeline> = {
              graphStructureId: graphStructure._id,
              queue,
              pathNodeIds: stringIdsToObjectIds(path),
              experimentId: stringIdToObjectId(experimentId),
            };
            return pipeline;
          })
        )
      )
    );
    const pipelines = results.flat();

    await Promise.all(
      pipelines.map((pipeline) =>
        this.workflowManager.create({
          instanceId: pipeline._id,
          status: PipelineStatus.idle,
          type: WorkflowType.PIPELINE,
        })
      )
    );

    const cloudPipelines = pipelines.filter(
      (pipeline) => pipeline.queue === ComputationQueue.cloud
    );
    if (cloudPipelines.length > 0) {
      await Promise.all(
        cloudPipelines.map((pipeline) =>
          this.changeStatus({
            pipelineId: pipeline._id,
            status: PipelineStatus.queued,
          })
        )
      );
    }

    return pipelines;
  }

  private readonly transitions: Transitions<PipelineStatus> = [
    {
      from: PipelineStatus.idle,
      to: PipelineStatus.queued,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          {
            $set: {
              progress: 0,
              statusMessage: 'В черзі',
              priority: 0,
            },
            $unset: { machineInfo: '', cloudJobId: '' },
          }
        ).exec();
      },
    },
    {
      from: PipelineStatus.queued,
      to: PipelineStatus.running,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          {
            $set: {
              progress: 0,
              statusMessage: 'Обчислення',
            },
          }
        ).exec();
      },
    },
    {
      from: PipelineStatus.running,
      to: PipelineStatus.completed,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          { $set: { progress: 100, statusMessage: 'Завершено' } }
        ).exec();
      },
    },
    {
      from: PipelineStatus.running,
      to: PipelineStatus.idle,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          { $unset: { machineInfo: '', cloudJobId: '', progress: '', statusMessage: '' } }
        ).exec();
      },
    },
  ];

  async changeStatus({ pipelineId, status, message }: ChangePipelineStatusInput) {
    const normalizedMessage = message?.trim() || PIPELINE_STATUS_LOG_MESSAGES[status];

    await this.workflowManager.changeStatus({
      instanceId: pipelineId,
      status,
      transitions: this.transitions,
      type: WorkflowType.PIPELINE,
      message: normalizedMessage,
    });

    await PipelineModel.updateOne(
      { _id: pipelineId },
      {
        $push: {
          history: {
            createdAt: new Date(),
            message: normalizedMessage,
            status,
          },
        },
      }
    ).exec();

    return true;
  }
}
