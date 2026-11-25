import { BatchClient, TerminateJobCommand } from '@aws-sdk/client-batch';
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
import {
  DEFAULT_OPTIMIZATION_LEASE_SECONDS,
  OPTIMIZATION_BLOCKED_BY_RERUN,
  OPTIMIZATION_LEASE_MARGIN_MS,
  OPTIMIZATION_RUNNING,
  RERUN_DURING_OPTIMIZATION,
  RERUN_IN_PROGRESS,
  RERUN_LEASE_MS,
  RERUN_LOCK_WAIT_ATTEMPTS,
  UNCOMPUTED_PIPELINES,
} from '../constants';
import { ConfirmedRunInput } from '../classes/ConfirmedRunInput';
import { confirmedExecutions, isConfirmedExecution } from '../utils/confirmedExecutions';
import { ExperimentLock } from './ExperimentLock';
import { ExperimentOperation } from '../../experiments/classes/ExperimentOperationLock';
import { isLostTransitionRace } from '../utils/isLostTransitionRace';

export class ComputationManager {
  private readonly graphManager = new GraphManager();
  private batchClient: BatchClient | null = null;
  private readonly optimizationRunner = new OptimizationRunner();
  private readonly workflowManager = new WorkflowManager();
  private readonly pipelineManager = new PipelineManager();
  private readonly experimentManager = new ExperimentManager();
  private readonly experimentLock = new ExperimentLock();
  // Overridden by tests; the pause between attempts to take a lock another re-run holds.
  private lockPollMs = 100;

  /**
   * Runs the optimization of an experiment. The attempt holds the experiment lock from the check of
   * its runs to its final status, so no re-run can be admitted and no other attempt can start in
   * between, including after the container reported its result and before the status is final.
   */
  async optimize(experimentId: ObjectIdOrString): Promise<OptimizationResult> {
    const experiment = await ExperimentModel.findById(experimentId).lean();
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const workflow = await this.workflowManager.getWorkflow({
      instanceId: experimentId,
      type: WorkflowType.EXPERIMENT,
    });
    this.assertOptimizable(workflow.status as ExperimentStatus);

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

    // The lease outlives the runner's own timeout, so it only frees an experiment whose backend died.
    const lock = await this.experimentLock.acquire(
      experimentId,
      ExperimentOperation.optimization,
      (optimizationTimeoutSeconds || DEFAULT_OPTIMIZATION_LEASE_SECONDS) * 1000 +
        OPTIMIZATION_LEASE_MARGIN_MS
    );
    if (!lock.acquired) {
      throw new Error(
        lock.heldBy === ExperimentOperation.rerun
          ? OPTIMIZATION_BLOCKED_BY_RERUN
          : OPTIMIZATION_RUNNING
      );
    }

    let leftForUnfinishedRun = false;
    try {
      // Read again under the lock: the status may have changed since the first read.
      const status = await this.experimentStatus(experimentId);
      this.assertOptimizable(status);
      // Nothing can add an unfinished run while the lock is held, so this stays true to the end.
      if (await this.hasUncomputedRun(experimentId)) {
        leftForUnfinishedRun = true;
        throw new Error(UNCOMPUTED_PIPELINES);
      }
      if (status !== ExperimentStatus.optimization) {
        await this.experimentManager.changeStatus({
          experimentId,
          status: ExperimentStatus.optimization,
        });
      }
      await ExperimentModel.updateOne(
        { _id: experimentId },
        { $set: { 'optimization.status': OptimizationStatus.optimizing } }
      );
      try {
        await this.optimizationRunner.run({
          experimentId,
          backendUrl: config.backend.graphqlUrl,
          backendToken: config.backend.serviceToken,
          hyperOptimizationMinutesPerPipeline,
          timeoutSeconds: optimizationTimeoutSeconds,
        });
      } catch (error) {
        // The experiment stays in `optimization`, as before, so the attempt can be retried.
        await ExperimentModel.updateOne(
          { _id: experimentId, 'optimization.status': OptimizationStatus.optimizing },
          { $set: { 'optimization.status': OptimizationStatus.failed } }
        );
        throw error;
      }
      await this.experimentManager.changeStatus({
        experimentId,
        status: ExperimentStatus.completed,
      });
    } finally {
      await this.experimentLock.release(experimentId, lock.token);
      // A run that completed while the lock was held found it busy and left the optimization to
      // the holder, so a holder that did not optimize because of an unfinished run looks again.
      if (leftForUnfinishedRun) void this.reoptimizeIfReady(experimentId);
    }

    return this.getOptimizationResult(experimentId);
  }

  private assertOptimizable(status: ExperimentStatus) {
    const allowed = [
      ExperimentStatus.computing,
      ExperimentStatus.completed,
      ExperimentStatus.optimization,
    ];
    if (!allowed.includes(status)) {
      throw new Error('Оптимізацію можна запускати лише зі статусів "Обчислення" або "Завершено".');
    }
  }

  private async hasUncomputedRun(experimentId: ObjectIdOrString): Promise<boolean> {
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
      // A run without a workflow (an interrupted re-run) is unfinished too.
      { $unwind: { path: '$workflow', preserveNullAndEmptyArrays: true } },
      {
        $match: {
          'workflow.status': { $ne: PipelineStatus.completed },
        },
      },
    ]);
    return Boolean(uncomputedPipeline);
  }

  async enqueueRuns(input: EnqueueExperimentRunsInput): Promise<void> {
    const { experimentId, pipelineId, runAll } = input;
    if (runAll && pipelineId) {
      throw new Error('Provide either runAll or pathNodeIds, not both.');
    }
    if (!runAll && !pipelineId) {
      throw new Error('Path node ids are required for a single run.');
    }

    await this.assertRunnable(experimentId, input.queue);

    let pipelineIds: Types.ObjectId[] = [];
    if (runAll) {
      const pipelines = await PipelineBaseService.listByExperiment(experimentId, input.queue);
      pipelineIds = pipelines.map((e) => e._id);
    } else if (pipelineId) {
      // The caller was checked against experimentId, so the pipeline has to belong to it.
      const pipeline = await PipelineBaseService.getById(pipelineId);
      if (String(pipeline.experimentId) !== String(experimentId)) {
        throw new Error('Конвеєр не знайдено');
      }
      if (input.rerun) {
        await this.admitRerun(pipeline);
        return;
      }
      pipelineIds = [pipeline._id];
    }

    await this.queueIdle(pipelineIds);
  }

  /**
   * Queues the runs of one queue that the user confirmed, each only while it is still the execution
   * the user saw. Returns the runs that were really queued; a run that changed status or execution
   * since the list was read, or does not belong to the experiment and queue, is left out, so the
   * caller can count it as skipped.
   */
  async queueRunsByIds(
    experimentId: ObjectIdOrString,
    queue: ComputationQueue,
    runs: ConfirmedRunInput[]
  ): Promise<Pipeline[]> {
    await this.assertRunnable(experimentId, queue);
    const candidates = await PipelineModel.find({
      _id: { $in: runs.map((run) => run.pipelineId) },
      experimentId: stringIdToObjectId(experimentId),
      queue,
    }).lean();
    const queued = await this.queueIdle(
      candidates.map((run) => run._id),
      confirmedExecutions(runs)
    );
    return PipelineModel.find({ _id: { $in: queued } }).lean();
  }

  /** The checks every start of computations needs: the experiment, its graph and its settings. */
  private async assertRunnable(experimentId: ObjectIdOrString, queue: ComputationQueue) {
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
    if (!graphSettings.queues.includes(queue)) {
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
    if (computationMode === ComputationMode.local && queue !== ComputationQueue.local) {
      throw new Error('Цей граф дозволяє лише локальні обчислення.');
    }
    if (computationMode === ComputationMode.cloud && queue !== ComputationQueue.cloud) {
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
  }

  /**
   * Moves the idle runs among `pipelineIds` to `queued`. A run that changed status since it was
   * read (a worker or another client) is skipped instead of failing the whole action, and with
   * `executions` so is a run whose execution is no longer the one the user confirmed; the update
   * checks the execution it read, so a change in between is skipped too. Returns the queued ids.
   */
  private async queueIdle(
    pipelineIds: Types.ObjectId[],
    executions?: ReturnType<typeof confirmedExecutions>
  ): Promise<Types.ObjectId[]> {
    const queued = await Promise.all(
      pipelineIds.map(async (nextPipelineId) => {
        const workflow = await this.workflowManager.getWorkflow({
          instanceId: nextPipelineId,
          type: WorkflowType.PIPELINE,
        });
        if (workflow.status !== PipelineStatus.idle) return null;
        if (
          executions &&
          !isConfirmedExecution(
            executions,
            nextPipelineId,
            PipelineStatus.idle,
            workflow.executionId
          )
        ) {
          return null;
        }
        try {
          const input = { pipelineId: nextPipelineId, status: PipelineStatus.queued };
          if (executions) {
            await this.pipelineManager.changeStatus(input, undefined, {
              executionId: workflow.executionId ?? null,
            });
          } else {
            await this.pipelineManager.changeStatus(input);
          }
          return nextPipelineId;
        } catch (error) {
          if (!isLostTransitionRace(error)) throw error;
          return null;
        }
      })
    );
    return queued.filter((id): id is Types.ObjectId => id !== null);
  }

  /**
   * Admits a re-run: everything from choosing the run to queueing it happens while this request
   * holds the experiment lock, so a second click waits and then finds the queued run, an
   * optimization cannot start in between, and a run is only ever queued after the experiment was
   * reopened with its CSV file checked again. If the admission fails, nothing it made is left.
   */
  private async admitRerun(source: Pipeline) {
    const token = await this.acquireForRerun(source.experimentId);
    let admitted = false;
    try {
      const runId = await this.prepareRerun(source);
      await this.queueIdle([runId]);
      admitted = true;
    } finally {
      await this.experimentLock.release(source.experimentId, token);
      // A run that completed while the lock was held left the optimization to the holder.
      if (!admitted) void this.reoptimizeIfReady(source.experimentId);
    }
  }

  /** Waits for another re-run's admission to finish; an optimization in progress is a refusal. */
  private async acquireForRerun(experimentId: Types.ObjectId): Promise<string> {
    for (let attempt = 0; attempt < RERUN_LOCK_WAIT_ATTEMPTS; attempt += 1) {
      const lock = await this.experimentLock.acquire(
        experimentId,
        ExperimentOperation.rerun,
        RERUN_LEASE_MS
      );
      if (lock.acquired) return lock.token;
      if (lock.heldBy === ExperimentOperation.optimization) {
        throw new Error(RERUN_DURING_OPTIMIZATION);
      }
      await new Promise((resolve) => setTimeout(resolve, this.lockPollMs));
    }
    throw new Error(RERUN_IN_PROGRESS);
  }

  /**
   * A re-run is a new run of the same path, so the finished one stays for comparison. Returns the
   * run to queue: the source itself unless it is completed, or the run of this path that is already
   * waiting or running, so a second click creates nothing. Runs under the experiment lock.
   */
  private async prepareRerun(source: Pipeline): Promise<Types.ObjectId> {
    if ((await this.runStatus(source)) !== PipelineStatus.completed) return source._id;

    const sameRuns = await PipelineModel.find({
      experimentId: source.experimentId,
      queue: source.queue,
      pathNodeIds: source.pathNodeIds,
    }).lean();
    for (const run of sameRuns) {
      if ((await this.runStatus(run)) !== PipelineStatus.completed) {
        // An admission that died after creating the run may have left the experiment closed.
        await this.reopenExperiment(source.experimentId);
        return run._id;
      }
    }

    if ((await this.experimentStatus(source.experimentId)) === ExperimentStatus.optimization) {
      throw new Error(RERUN_DURING_OPTIMIZATION);
    }

    // Each run can be re-run once, so the re-run hangs on the newest run of the path.
    const latest = sameRuns.reduce(
      (newest, run) => (+new Date(run.createdAt) > +new Date(newest.createdAt) ? run : newest),
      source
    );
    const created = await PipelineModel.create({
      graphStructureId: source.graphStructureId,
      queue: source.queue,
      pathNodeIds: source.pathNodeIds,
      experimentId: source.experimentId,
      rerunOf: latest._id,
    });
    await this.pipelineManager.ensureRerunWorkflow(created._id);
    try {
      await this.reopenExperiment(source.experimentId);
    } catch (error) {
      // The experiment could not be reopened (its file is gone): no new run. Nobody else could
      // have queued it, because the lock is still held.
      await PipelineModel.deleteOne({ _id: created._id });
      await WorkflowModel.deleteOne({ instanceId: created._id, type: WorkflowType.PIPELINE });
      throw error;
    }
    return created._id;
  }

  private async experimentStatus(experimentId: ObjectIdOrString): Promise<ExperimentStatus> {
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: experimentId,
      type: WorkflowType.EXPERIMENT,
    });
    return workflow.status as ExperimentStatus;
  }

  /**
   * A completed experiment goes back to `computing` for a re-run; any other status stays. The
   * transition checks the CSV file before and again after the status write and puts the status
   * back if it is gone, so this returns only once the file is confirmed.
   */
  private async reopenExperiment(experimentId: Types.ObjectId) {
    const status = await this.experimentStatus(experimentId);
    if (status === ExperimentStatus.optimization) {
      throw new Error(RERUN_DURING_OPTIMIZATION);
    }
    if (status !== ExperimentStatus.completed) return;
    await this.experimentManager.changeStatus({
      experimentId,
      status: ExperimentStatus.computing,
    });
  }

  /**
   * The status of a run. Only an admission holding the lock creates re-runs, so a run without a
   * workflow here was left by one that died between its two writes: its idle workflow is created.
   */
  private async runStatus(run: Pipeline): Promise<PipelineStatus> {
    const workflow = await this.findRunWorkflow(run._id);
    if (workflow) return workflow.status as PipelineStatus;
    await this.pipelineManager.ensureRerunWorkflow(run._id);
    return PipelineStatus.idle;
  }

  private findRunWorkflow(runId: Types.ObjectId) {
    return WorkflowModel.findOne({ instanceId: runId, type: WorkflowType.PIPELINE }).lean();
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
    await this.stopExecutionJob(pipeline._id, workflow.executionId);
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
    return PipelineBaseService.getById(pipelineId);
  }

  /**
   * Marks the execution as stopped and cancels the AWS job it recorded; the mark and the read of
   * the job id are one update. `CloudComputationWorker.submitRun` records a job id only for an
   * unmarked execution and cancels the job itself otherwise, so one side cancels it. This runs
   * before the status change: a write can fail once the run is `idle`, and a repeated Stop would
   * then find nothing to stop, while a failure before the change leaves the run to stop again.
   */
  private async stopExecutionJob(pipelineId: Types.ObjectId, executionId?: number) {
    const before = await PipelineModel.findOneAndUpdate(
      { _id: pipelineId, executionId: executionId ?? null },
      { $set: { stoppedExecutionId: executionId ?? 0 } }
    ).lean();
    if (before?.queue === ComputationQueue.cloud && before.cloudJobId) {
      await this.cancelCloudJob(before.cloudJobId);
    }
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
      void this.reoptimizeAfterRerun(pipelineId);
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

  /** A completed run may be the last one of a re-run: see `reoptimizeIfReady`. */
  private async reoptimizeAfterRerun(pipelineId: Types.ObjectId) {
    const pipeline = await PipelineModel.findById(pipelineId)
      .lean()
      .catch(() => null);
    if (pipeline) await this.reoptimizeIfReady(pipeline.experimentId);
  }

  /**
   * An optimized experiment that a re-run reopened (`computing`, with a best pipeline left from the
   * last optimization) is optimized again once all its runs are completed. This is checked when a
   * run completes and whenever the experiment lock is let go without optimizing, because a run
   * that completed while the lock was held found it busy and left the optimization to the holder.
   * Of several callers only the one that takes the lock optimizes.
   */
  private async reoptimizeIfReady(experimentId: ObjectIdOrString) {
    try {
      const experiment = await ExperimentModel.findById(experimentId).lean();
      if (!experiment?.optimization?.bestPipelineId) return;
      if ((await this.experimentStatus(experimentId)) !== ExperimentStatus.computing) return;
      if (await this.hasUncomputedRun(experimentId)) return;
      await this.optimize(experimentId);
    } catch (error) {
      // The lock is busy (its holder looks again when it lets go), or a run became unfinished.
      const handled = [OPTIMIZATION_RUNNING, OPTIMIZATION_BLOCKED_BY_RERUN, UNCOMPUTED_PIPELINES];
      if (error instanceof Error && handled.includes(error.message)) return;
      console.error('Automatic re-optimization failed', error);
    }
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

  async pauseExperimentRuns(
    experimentId: ObjectIdOrString,
    queue?: ComputationQueue,
    confirmedRuns?: ConfirmedRunInput[]
  ): Promise<Pipeline[]> {
    const confirmed = confirmedRuns ? confirmedExecutions(confirmedRuns) : undefined;
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
      {
        $match: {
          experimentId: stringIdToObjectId(experimentId),
          ...(queue ? { queue } : {}),
          // A confirmed list limits the action to those runs, so one that became eligible after
          // the confirmation is left alone.
          ...(confirmedRuns
            ? { _id: { $in: confirmedRuns.map((run) => stringIdToObjectId(run.pipelineId)) } }
            : {}),
        },
      },
    ]);

    if (runs.length === 0) return [];

    // Only the runs this call really stopped are returned; one that finished or was stopped by
    // someone else meanwhile is left out, so the caller can report how many were skipped.
    const paused = await Promise.all(runs.map((run) => this.pauseRun(run._id, confirmed)));
    const runIds = runs.filter((_, index) => paused[index]).map((run) => run._id);
    return PipelineModel.find({ _id: { $in: runIds } }).lean();
  }

  // Queued and running runs both go back to idle, so no worker can claim them after the pause.
  // If a worker claims the run while it is being paused, re-read the status and stop it instead.
  // Returns whether this call moved the run to idle. With `confirmed`, only the run the user saw
  // is stopped: one that was stopped and started again meanwhile is a new run and is skipped. The
  // status change is conditional on the execution read, so a restart in between is skipped too.
  private async pauseRun(
    pipelineId: Types.ObjectId,
    confirmed?: ReturnType<typeof confirmedExecutions>
  ): Promise<boolean> {
    // queued -> running is the only change a worker can make first, so two retries suffice.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { status, executionId } = await this.workflowManager.getWorkflow({
        instanceId: pipelineId,
        type: WorkflowType.PIPELINE,
      });
      if (status !== PipelineStatus.queued && status !== PipelineStatus.running) return false;
      if (
        confirmed &&
        !isConfirmedExecution(confirmed, pipelineId, status as PipelineStatus, executionId)
      ) {
        return false;
      }
      if (status === PipelineStatus.running) await this.stopExecutionJob(pipelineId, executionId);
      try {
        await this.pipelineManager.changeStatus(
          { pipelineId, status: PipelineStatus.idle, message: 'Обчислення зупинено' },
          undefined,
          { executionId: executionId ?? null }
        );
        return true;
      } catch (error) {
        if (!isLostTransitionRace(error)) throw error;
      }
    }
    return false;
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
    // CancelJob succeeds without stopping a STARTING or RUNNING job; TerminateJob covers every state.
    try {
      await this.getBatchClient().send(
        new TerminateJobCommand({ jobId, reason: 'Paused by user' })
      );
    } catch (error) {
      console.warn('Не вдалося скасувати AWS-завдання', error);
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
