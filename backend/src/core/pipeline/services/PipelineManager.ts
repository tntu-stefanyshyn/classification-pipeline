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
            $unset: { machineInfo: '' },
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
              statusMessage: 'Запущено',
            },
          }
        ).exec();
      },
    },
    {
      from: PipelineStatus.running,
      to: PipelineStatus.paused,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          {
            $set: { statusMessage: 'Пауза' },
            $unset: { machineInfo: '', cloudJobId: '' },
          }
        ).exec();
      },
    },
    {
      from: PipelineStatus.paused,
      to: PipelineStatus.running,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          {
            $set: { statusMessage: 'Запущено' },
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
      to: PipelineStatus.failed,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          { $set: { progress: 100, statusMessage: 'Помилка' } }
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
    {
      from: PipelineStatus.paused,
      to: PipelineStatus.idle,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          { $unset: { machineInfo: '', cloudJobId: '', progress: '', statusMessage: '' } }
        ).exec();
      },
    },
    {
      from: PipelineStatus.queued,
      to: PipelineStatus.idle,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          { $unset: { machineInfo: '', cloudJobId: '', progress: '', statusMessage: '' } }
        ).exec();
      },
    },
    {
      from: PipelineStatus.failed,
      to: PipelineStatus.queued,
      sideEffect: async ({ instanceId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId },
          {
            $set: { progress: 0, statusMessage: 'В черзі' },
            $unset: { machineInfo: '', cloudJobId: '' },
          }
        ).exec();
      },
    },
  ];

  async changeStatus({
    pipelineId,
    status,
    message,
  }: ChangePipelineStatusInput & { message?: string }) {
    await this.workflowManager.changeStatus({
      instanceId: pipelineId,
      status,
      transitions: this.transitions,
      type: WorkflowType.PIPELINE,
      message,
    });

    return true;
  }
}
