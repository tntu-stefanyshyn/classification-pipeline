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
import { config } from '../../../config/config';

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

    const autoQueuedPipelines = pipelines.filter((pipeline) =>
      this.shouldAutoQueueGeneratedPipeline(pipeline.queue, queues)
    );
    if (autoQueuedPipelines.length > 0) {
      await Promise.all(
        autoQueuedPipelines.map((pipeline) =>
          this.changeStatus({
            pipelineId: pipeline._id,
            status: PipelineStatus.queued,
          })
        )
      );
    }

    return pipelines;
  }

  private shouldAutoQueueGeneratedPipeline(queue: ComputationQueue, configuredQueues: string[]) {
    if (queue === ComputationQueue.cloud) {
      return config.computations.cloudWorkerEnabled || config.computations.localWorkerEnabled;
    }

    return queue === ComputationQueue.local && !configuredQueues.includes(ComputationQueue.cloud);
  }

  private readonly transitions: Transitions<PipelineStatus> = [
    {
      from: PipelineStatus.idle,
      to: PipelineStatus.queued,
      // Scoped to the last execution: once a newer claim raised the fence, this reset is stale.
      sideEffect: async ({ instanceId, executionId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId, executionId: executionId ?? null },
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
      // Pausing an experiment takes its queued runs out of the queue.
      from: PipelineStatus.queued,
      to: PipelineStatus.idle,
      sideEffect: async ({ instanceId, executionId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId, executionId: executionId ?? null },
          { $unset: { machineInfo: '', cloudJobId: '', progress: '', statusMessage: '' } }
        ).exec();
      },
    },
    {
      from: PipelineStatus.queued,
      to: PipelineStatus.running,
      sideEffect: async ({ instanceId, executionId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId, executionId: executionId ?? null },
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
      sideEffect: async ({ instanceId, executionId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId, executionId: executionId ?? null },
          { $set: { progress: 100, statusMessage: 'Завершено' } }
        ).exec();
      },
    },
    {
      from: PipelineStatus.running,
      to: PipelineStatus.idle,
      // Cleanup of the execution that stopped; a later execution's state is left alone.
      // cloudJobId stays until the run is queued again, so Stop/Pause can cancel that job.
      sideEffect: async ({ instanceId, executionId }) => {
        await PipelineModel.updateOne(
          { _id: instanceId, executionId: executionId ?? null },
          { $unset: { machineInfo: '', progress: '', statusMessage: '' } }
        ).exec();
      },
    },
  ];

  async changeStatus(
    { pipelineId, status, message }: ChangePipelineStatusInput,
    fields?: Record<string, unknown>,
    expected?: Record<string, unknown>,
    transitions = this.transitions
  ) {
    const normalizedMessage = message?.trim() || PIPELINE_STATUS_LOG_MESSAGES[status];

    await this.workflowManager.changeStatus({
      instanceId: pipelineId,
      status,
      transitions,
      type: WorkflowType.PIPELINE,
      message: normalizedMessage,
      fields,
      expected,
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

  /**
   * A status change sent through `changePipelineStatus`, which carries no execution identity.
   * It cannot end a running execution: the user stops one with `stopExperimentRun` and a worker
   * reports one with `failExperimentRun`/`completePipeline`, so a late report from an old worker
   * that still uses this mutation cannot end a newer execution of the same run. The transition is
   * chosen from the status the update matches, so a run that starts meanwhile is not affected.
   * `COMPUTATIONS_ACCEPT_LEGACY_REPORTS` does not lift this: it only admits reports without an
   * executionId, never an anonymous status change of a running run.
   */
  changeStatusFromApi(input: ChangePipelineStatusInput) {
    return this.changeStatus(input, undefined, undefined, this.apiTransitions);
  }

  private readonly apiTransitions = this.transitions.filter(
    (transition) => transition.from !== PipelineStatus.running
  );
}
