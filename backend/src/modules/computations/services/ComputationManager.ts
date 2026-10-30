import { BatchClient, CancelJobCommand, TerminateJobCommand } from '@aws-sdk/client-batch';
import { Types } from 'mongoose';
import { config } from '../../../config/config';
import { ComputationQueue } from '../classes/ComputationQueue';
import {
  PipelineMachineInfo,
  PipelineMachineInfoInput,
} from '../../../core/pipeline/classes/PipelineMachineInfo';
import { GraphManager } from '../../experiments/services/GraphManager';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../../experiments/models/GraphStructureModel';
import { ExperimentStatus } from '../../experiments/classes/ExperimentStatus';
import { OptimizationStatus } from '../../experiments/classes/OptimizationStatus';
import { ClassificationStage } from '../../experiments/classes/ClassificationStage';
import { buildGraphPaths } from '../../experiments/utils/buildGraphPaths';
import { ComputationMode } from '../../experiments/classes/ComputationMode';
import { OptimizationRunner } from './OptimizationRunner';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
import {
  Pipeline,
  PipelineBaseService,
  PipelineModel,
  pipelinesCollectionName,
} from '../../../core/pipeline';
import { PipelineStatus } from '../../../core/pipeline/enums';
import { WorkflowManager } from '../../../core/workflow/services/WorkflowManager';
import { WorkflowType } from '../../../core/workflow/enums';
import { PipelineManager } from '../../../core/pipeline/services/PipelineManager';
import { stringIdToObjectId } from '../../../utils';
import { WorkflowModel, workflowsCollectionName } from '../../../core/workflow/model/WorkflowModel';
import { WorkflowTransitionConflictError } from '../../../core/workflow/errors';
import { ObjectIdOrString } from '../../../types/context';
import { CompletePipelineInput } from '../classes/CompleteExperimentRunInput';
import { ExperimentManager } from '../../experiments/services/ExperimentManager';
import { OptimizationResult } from '../classes/OptimizationResult';
import { executionFilter } from '../../../core/pipeline/executionFilter';

export class ComputationManager {
  private readonly graphManager = new GraphManager();
  private batchClient: BatchClient | null = null;
  private readonly optimizationRunner = new OptimizationRunner();
  private readonly workflowManager = new WorkflowManager();
  private readonly pipelineManager = new PipelineManager();
  private readonly experimentManager = new ExperimentManager();

  async optimize(experimentId: ObjectIdOrString): Promise<OptimizationResult> {
    const experiment = await ExperimentModel.findById(experimentId).lean();
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const workflow = await this.workflowManager.getWorkflow({
      instanceId: experimentId,
      type: WorkflowType.EXPERIMENT,
    });
    const optimizationStatus = experiment.optimization?.status;
    const isOptimizationInProgress = optimizationStatus === OptimizationStatus.optimizing;
    const canEnterOptimization =
      workflow.status === ExperimentStatus.computing ||
      workflow.status === ExperimentStatus.completed;

    if (workflow.status === ExperimentStatus.optimization && isOptimizationInProgress) {
      throw new Error('Оптимізація вже виконується.');
    }

    if (!canEnterOptimization && workflow.status !== ExperimentStatus.optimization) {
      throw new Error('Оптимізацію можна запускати лише зі статусів "Обчислення" або "Завершено".');
    }

    const graph = await GraphStructureModel.findOne({ experimentId }).lean();
    const metrics = graph?.settings?.metrics;
    if (!metrics) {
      throw new Error('Graph metrics are not configured.');
    }
    const hyperOptimizationMinutesPerPipeline =
      graph?.settings?.hyperOptimizationMinutesPerPipeline ?? 30;
    const graphNodes = graph?.nodes ?? [];
    const graphPaths = buildGraphPaths(graphNodes);
    if (graphPaths.length === 0) {
      throw new Error('Graph has no paths for optimization.');
    }
    const optimizationTimeoutSeconds =
      Math.trunc(hyperOptimizationMinutesPerPipeline * 60 * graphPaths.length) || 0;

    const [uncomputedPipeline] = await PipelineModel.aggregate([
      { $match: { experimentId: stringIdToObjectId(experimentId) } },
      {
        $lookup: {
          from: workflowsCollectionName,
          localField: '_id',
          foreignField: 'instanceId',
          as: 'workflow',
        },
      },
      { $unwind: { path: '$workflow' } },
      {
        $match: {
          'workflow.status': { $ne: PipelineStatus.completed },
        },
      },
    ]);

    if (uncomputedPipeline) {
      throw new Error('There are uncomuted pipelines.');
    }

    if (canEnterOptimization) {
      await this.experimentManager.changeStatus({
        experimentId,
        status: ExperimentStatus.optimization,
      });
    }

    await this.optimizationRunner.run({
      experimentId,
      backendUrl: config.backend.graphqlUrl,
      backendToken: config.backend.serviceToken,
      hyperOptimizationMinutesPerPipeline,
      timeoutSeconds: optimizationTimeoutSeconds,
    });

    await this.experimentManager.changeStatus({
      experimentId,
      status: ExperimentStatus.completed,
    });

    return this.getOptimizationResult(experimentId);
  }

  async enqueueRuns(input: EnqueueExperimentRunsInput) {
    const { experimentId, pipelineId, runAll } = input;
    if (runAll && pipelineId) {
      throw new Error('Provide either runAll or pathNodeIds, not both.');
    }
    if (!runAll && !pipelineId) {
      throw new Error('Path node ids are required for a single run.');
    }

    const experiment = await ExperimentModel.findById(experimentId).lean();
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const graph = await this.graphManager.getByExperimentId(experimentId);
    const graphSettings = graph.settings;
    if (!graphSettings || !graphSettings.metrics) {
      throw new Error('Спочатку заповніть налаштування графа.');
    }
    if (!Array.isArray(graphSettings.queues) || graphSettings.queues.length === 0) {
      throw new Error('Оберіть хоча б один тип обчислень у налаштуваннях графа.');
    }
    if (!graphSettings.queues.includes(input.queue)) {
      throw new Error('Обраний тип обчислень не дозволений у налаштуваннях графа.');
    }
    const metrics = graphSettings.metrics;
    const weights = [metrics.accuracy, metrics.f1, metrics.rocAuc, metrics.ntps];
    const hasInvalidWeight = weights.some((value) => !Number.isFinite(value));
    const sum = weights.reduce((total, value) => total + value, 0);
    if (hasInvalidWeight || Math.abs(sum - 1) > 0.0001) {
      throw new Error('Налаштування ваг метрик некоректні. Перевірте значення.');
    }

    const computationMode = graph.computationMode ?? ComputationMode.both;
    if (computationMode === ComputationMode.local && input.queue !== ComputationQueue.local) {
      throw new Error('Цей граф дозволяє лише локальні обчислення.');
    }
    if (computationMode === ComputationMode.cloud && input.queue !== ComputationQueue.cloud) {
      throw new Error('Цей граф дозволяє лише хмарні обчислення.');
    }

    const nodes = graph.nodes ?? [];
    const paths = buildGraphPaths(nodes);
    if (paths.length === 0) {
      throw new Error('Graph has no paths to run.');
    }
    const nodeById = new Map(nodes.map((node) => [String(node._id), node]));
    const allPathsHaveClassification = paths.every((path) =>
      path.some((nodeId) => nodeById.get(nodeId)?.stage === ClassificationStage.CLASSIFICATION)
    );
    if (!allPathsHaveClassification) {
      throw new Error('Усі конвеєри мають містити етап класифікації.');
    }

    let pipelineIds: Types.ObjectId[] = [];
    if (runAll) {
      const pipelines = await PipelineBaseService.listByExperiment(experimentId);
      pipelineIds = pipelines.map((e) => e._id);
    } else if (pipelineId) {
      pipelineIds = [stringIdToObjectId(pipelineId)];
    }

    const idlePipelineIds = (
      await Promise.all(
        pipelineIds.map(async (nextPipelineId) => {
          const workflow = await this.workflowManager.getWorkflow({
            instanceId: nextPipelineId,
            type: WorkflowType.PIPELINE,
          });
          return workflow.status === PipelineStatus.idle ? nextPipelineId : null;
        })
      )
    ).filter(Boolean) as Types.ObjectId[];

    await Promise.all(
      idlePipelineIds.map((nextPipelineId) =>
        this.pipelineManager.changeStatus({
          pipelineId: nextPipelineId,
          status: PipelineStatus.queued,
        })
      )
    );
  }

  async stopRun(pipelineId: string): Promise<Pipeline> {
    const pipeline = await PipelineBaseService.getById(pipelineId);
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: pipeline._id,
      type: WorkflowType.PIPELINE,
    });
    if (workflow.status !== PipelineStatus.running) {
      return pipeline;
    }
    const jobId = await this.markStopped(pipeline._id, workflow.executionId);
    try {
      await this.pipelineManager.changeStatus(
        { pipelineId: pipeline._id, status: PipelineStatus.idle, message: 'Зупинено користувачем' },
        undefined,
        { executionId: workflow.executionId ?? null }
      );
    } catch (error) {
      // It completed, failed or was stopped meanwhile: there is nothing left to stop.
      const lostRace =
        error instanceof WorkflowTransitionConflictError ||
        (error instanceof Error && error.message === 'TRANSITION_NOT_FOUND');
      if (!lostRace) throw error;
      return PipelineBaseService.getById(pipelineId);
    }
    if (jobId) await this.cancelCloudJob(jobId);
    return PipelineBaseService.getById(pipelineId);
  }

  /**
   * Marks the execution as stopped and returns the AWS job id it recorded, in one update made
   * before the status change. `CloudComputationWorker.submitRun` records a job id only for an
   * unmarked execution and cancels the job itself otherwise, so the job is cancelled by one side
   * whatever a requeue or a new claim changes on the pipeline in between.
   */
  private async markStopped(pipelineId: Types.ObjectId, executionId?: number) {
    const before = await PipelineModel.findOneAndUpdate(
      { _id: pipelineId, executionId: executionId ?? null },
      { $set: { stoppedExecutionId: executionId ?? 0 } }
    ).lean();
    return before?.queue === ComputationQueue.cloud ? before.cloudJobId : undefined;
  }

  async claimNextRun(
    queue: ComputationQueue,
    machineInfo?: PipelineMachineInfoInput
  ): Promise<Pipeline | undefined> {
    // One local run per machine (unique index on the workflow), so the hostname is required.
    const hostname = queue === ComputationQueue.local ? machineInfo?.hostname?.trim() : undefined;
    if (queue === ComputationQueue.local && !hostname) {
      throw new Error('Для локальних запусків потрібна назва машини (machineInfo.hostname)');
    }

    const normalizedMachineInfo = this.normalizeMachineInfo(queue, machineInfo);
    const candidates = await WorkflowModel.aggregate<Pipeline>([
      { $match: { type: WorkflowType.PIPELINE, status: PipelineStatus.queued } },
      {
        $lookup: {
          from: pipelinesCollectionName,
          localField: 'instanceId',
          foreignField: '_id',
          as: 'pipeline',
        },
      },
      { $unwind: '$pipeline' },
      { $replaceRoot: { newRoot: '$pipeline' } },
      { $match: { queue } },
      { $sort: { priority: -1, updatedAt: 1 } },
    ]);

    // A worker that loses a race moves on to the next queued run instead of waiting a poll.
    for (const pipeline of candidates) {
      const workflow = await WorkflowModel.findOne({
        instanceId: pipeline._id,
        type: WorkflowType.PIPELINE,
      }).lean();
      if (workflow?.status !== PipelineStatus.queued) continue;
      const previousExecutionId = workflow.executionId;
      const executionId = (previousExecutionId ?? 0) + 1;

      // Raise the pipeline's execution fence first: from here on, reports of earlier executions
      // match nothing. The status change below then gives this number to exactly one claimant.
      // A result left by an earlier execution goes too, so the new one cannot inherit it.
      await PipelineModel.updateOne(
        { _id: pipeline._id, executionId: { $not: { $gte: executionId } } },
        { $set: { executionId }, $unset: { computingResult: '' } }
      );
      try {
        await this.pipelineManager.changeStatus(
          { pipelineId: pipeline._id, status: PipelineStatus.running },
          { executionId, ...(hostname ? { machineHostname: hostname } : {}) },
          { executionId: previousExecutionId ?? null }
        );
      } catch (error) {
        // Duplicate key: a run is already `running` on this machine.
        if ((error as { code?: number }).code === 11000) return;
        // Another worker claimed this run first: either the conditional update lost, or the
        // re-read status was already `running`, which has no transition to `running`.
        if (error instanceof WorkflowTransitionConflictError) continue;
        if (error instanceof Error && error.message === 'TRANSITION_NOT_FOUND') continue;
        throw error;
      }

      if (normalizedMachineInfo) {
        await PipelineModel.updateOne(
          { _id: pipeline._id, executionId },
          { $set: { machineInfo: normalizedMachineInfo } }
        );
        await this.registerMachineInfo(pipeline.experimentId, normalizedMachineInfo);
      }

      return { ...pipeline, executionId };
    }
  }

  /**
   * Moves the run out of `running` only if `executionId` is still its current execution; the
   * condition is part of the status update. Returns false if it was not running any more.
   */
  private async finishExecution(
    pipelineId: Types.ObjectId,
    execution: ReturnType<typeof executionFilter>,
    status: PipelineStatus.completed | PipelineStatus.idle,
    message: string
  ): Promise<boolean> {
    try {
      await this.pipelineManager.endExecution({ pipelineId, status, message }, execution);
      return true;
    } catch (error) {
      if (error instanceof WorkflowTransitionConflictError) return false;
      if (error instanceof Error && error.message === 'TRANSITION_NOT_FOUND') return false;
      throw error;
    }
  }

  /**
   * Saves the result before the run moves to `completed`, so a completed run always has one: a
   * failed write leaves it `running` and the report can be retried. The fence keeps stale reports
   * out, and the first report of an execution wins. Returns whether this execution completed the
   * run, now or with an earlier report.
   */
  private async saveResult(
    pipelineId: Types.ObjectId,
    executionId: string | number,
    result: unknown,
    message: string
  ) {
    const execution = executionFilter(executionId);
    await PipelineModel.updateOne(
      { _id: pipelineId, ...execution, computingResult: { $exists: false } },
      { $set: { computingResult: result } }
    );
    if (await this.finishExecution(pipelineId, execution, PipelineStatus.completed, message)) {
      return true;
    }
    const alreadyCompleted = await WorkflowModel.exists({
      instanceId: pipelineId,
      type: WorkflowType.PIPELINE,
      status: PipelineStatus.completed,
      ...execution,
    });
    if (alreadyCompleted) return true;

    // A Stop or a failure ended this execution first, so its result does not count.
    await PipelineModel.updateOne(
      { _id: pipelineId, ...execution },
      { $unset: { computingResult: '' } }
    );
    return false;
  }

  /** Returns false when the report belongs to an execution that is no longer current. */
  async completePipeline({ payload, pipelineId, executionId }: CompletePipelineInput) {
    const pipeline = await PipelineBaseService.getById(pipelineId);
    return this.saveResult(pipeline._id, executionId, payload, 'Завершено');
  }

  async completeRun({
    runId,
    executionId,
    resultJson,
    statusMessage,
  }: {
    runId: string;
    executionId: string | number;
    resultJson: string;
    statusMessage?: string;
  }): Promise<Pipeline> {
    const pipeline = await PipelineBaseService.getById(runId);
    const parsedResult = JSON.parse(resultJson) as Record<string, unknown>;
    await this.saveResult(pipeline._id, executionId, parsedResult, statusMessage ?? 'Завершено');
    return PipelineBaseService.getById(runId);
  }

  async failRun({
    runId,
    executionId,
    statusMessage,
  }: {
    runId: string;
    executionId: string | number;
    statusMessage?: string;
  }): Promise<Pipeline> {
    const pipeline = await PipelineBaseService.getById(runId);
    await this.finishExecution(
      pipeline._id,
      executionFilter(executionId),
      PipelineStatus.idle,
      statusMessage ?? 'Некоректне завершення обчислення'
    );
    return PipelineBaseService.getById(runId);
  }

  async pauseExperimentRuns(experimentId: ObjectIdOrString): Promise<Pipeline[]> {
    const runs = await WorkflowModel.aggregate<Pipeline>([
      {
        $match: {
          type: WorkflowType.PIPELINE,
          status: { $in: [PipelineStatus.queued, PipelineStatus.running] },
        },
      },
      {
        $lookup: {
          from: pipelinesCollectionName,
          localField: 'instanceId',
          foreignField: '_id',
          as: 'pipeline',
        },
      },
      { $unwind: '$pipeline' },
      { $replaceRoot: { newRoot: '$pipeline' } },
      { $match: { experimentId: stringIdToObjectId(experimentId) } },
    ]);

    if (runs.length === 0) return [];

    await Promise.all(runs.map((run) => this.pauseRun(run._id)));

    const runIds = runs.map((run) => run._id);
    return PipelineModel.find({ _id: { $in: runIds } }).lean();
  }

  // Queued and running runs both go back to idle, so no worker can claim them after the pause.
  // If a worker claims the run while it is being paused, re-read the status and stop it instead.
  private async pauseRun(pipelineId: Types.ObjectId) {
    // queued -> running is the only change a worker can make first, so two retries suffice.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { status, executionId } = await this.workflowManager.getWorkflow({
        instanceId: pipelineId,
        type: WorkflowType.PIPELINE,
      });
      if (status !== PipelineStatus.queued && status !== PipelineStatus.running) return;
      const jobId =
        status === PipelineStatus.running
          ? await this.markStopped(pipelineId, executionId)
          : undefined;
      try {
        await this.pipelineManager.changeStatus(
          { pipelineId, status: PipelineStatus.idle, message: 'Обчислення зупинено' },
          undefined,
          { executionId: executionId ?? null }
        );
        if (jobId) await this.cancelCloudJob(jobId);
        return;
      } catch (error) {
        const lostRace =
          error instanceof WorkflowTransitionConflictError ||
          (error instanceof Error && error.message === 'TRANSITION_NOT_FOUND');
        if (!lostRace) throw error;
      }
    }
  }

  async resumeExperimentRuns(experimentId: string): Promise<Pipeline[]> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    const experimentObjectId = new Types.ObjectId(trimmedId);
    const runs = await WorkflowModel.aggregate<Pipeline>([
      {
        $match: {
          type: WorkflowType.PIPELINE,
          status: PipelineStatus.idle,
        },
      },
      {
        $lookup: {
          from: pipelinesCollectionName,
          localField: 'instanceId',
          foreignField: '_id',
          as: 'pipeline',
        },
      },
      { $unwind: '$pipeline' },
      { $replaceRoot: { newRoot: '$pipeline' } },
      { $match: { experimentId: experimentObjectId } },
    ]);

    if (runs.length === 0) return [];

    const runIds = runs.map((run) => run._id);
    await Promise.all(
      runIds.map((runId) =>
        this.pipelineManager.changeStatus({ pipelineId: runId, status: PipelineStatus.queued })
      )
    );

    return PipelineModel.find({ _id: { $in: runIds } }).lean();
  }

  private normalizeMachineInfo(
    queue: ComputationQueue,
    input?: PipelineMachineInfoInput
  ): PipelineMachineInfo {
    const normalized: PipelineMachineInfo = {
      queue,
      lastSeenAt: new Date(),
    };

    const trim = (value?: string) => (typeof value === 'string' ? value.trim() : '');
    const hostname = trim(input?.hostname);
    if (hostname) normalized.hostname = hostname;
    const platform = trim(input?.platform);
    if (platform) normalized.platform = platform;
    const arch = trim(input?.arch);
    if (arch) normalized.arch = arch;
    const release = trim(input?.release);
    if (release) normalized.release = release;
    const cpuModel = trim(input?.cpuModel);
    if (cpuModel) normalized.cpuModel = cpuModel;
    const gpuModel = trim(input?.gpuModel);
    if (gpuModel) normalized.gpuModel = gpuModel;

    if (typeof input?.cores === 'number' && Number.isFinite(input.cores) && input.cores > 0) {
      normalized.cores = Math.round(input.cores);
    }
    if (
      typeof input?.memoryGb === 'number' &&
      Number.isFinite(input.memoryGb) &&
      input.memoryGb > 0
    ) {
      normalized.memoryGb = Math.round(input.memoryGb * 10) / 10;
    }

    const appVersion = trim(input?.appVersion);
    if (appVersion) normalized.appVersion = appVersion;

    return normalized;
  }

  private async registerMachineInfo(
    experimentId: Types.ObjectId,
    machineInfo: PipelineMachineInfo
  ) {
    const experiment = await ExperimentModel.findById(experimentId).lean();
    if (!experiment) return;

    const existingHosts = experiment.computationHosts ?? [];
    const matchIndex = existingHosts.findIndex(
      (host) => String(host.queue ?? '') === String(machineInfo.queue ?? '')
    );

    const nextHosts = [...existingHosts];
    if (matchIndex >= 0) {
      const current = nextHosts[matchIndex];
      nextHosts[matchIndex] = {
        ...current,
        ...machineInfo,
        lastSeenAt: machineInfo.lastSeenAt ?? current.lastSeenAt,
      };
    } else {
      nextHosts.push(machineInfo);
    }

    await ExperimentModel.findByIdAndUpdate(experimentId, {
      $set: { computationHosts: nextHosts },
    });
  }

  private getBatchClient() {
    if (!this.batchClient) {
      this.batchClient = new BatchClient({
        region: config.aws.region || config.s3.region || undefined,
        credentials:
          config.aws.accessKeyId && config.aws.secretAccessKey
            ? {
                accessKeyId: config.aws.accessKeyId,
                secretAccessKey: config.aws.secretAccessKey,
              }
            : undefined,
      });
    }
    return this.batchClient;
  }

  async cancelCloudJob(jobId: string) {
    if (!jobId) return;
    const client = this.getBatchClient();
    try {
      await client.send(
        new CancelJobCommand({
          jobId,
          reason: 'Paused by user',
        })
      );
    } catch (error) {
      try {
        await client.send(
          new TerminateJobCommand({
            jobId,
            reason: 'Paused by user',
          })
        );
      } catch (innerError) {
        console.warn('Не вдалося скасувати AWS-завдання', innerError);
      }
    }
  }

  private async getOptimizationResult(experimentId: ObjectIdOrString): Promise<OptimizationResult> {
    const experiment = await ExperimentModel.findById(experimentId).lean();
    const bestPipelineId = experiment?.optimization?.bestPipelineId;
    const bestScore = experiment?.optimization?.bestScore;

    if (!bestPipelineId || typeof bestScore !== 'number') {
      throw new Error('Optimization result is missing');
    }

    const pipeline = await PipelineBaseService.getById(bestPipelineId);

    return {
      runId: String(bestPipelineId),
      pathNodeIds: (pipeline.pathNodeIds ?? []).map((id) => String(id)),
      score: bestScore,
    };
  }
}
