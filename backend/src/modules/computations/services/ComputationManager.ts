import { BatchClient, CancelJobCommand, TerminateJobCommand } from '@aws-sdk/client-batch';
import { Types } from 'mongoose';
import { config } from '../../../config/config';
import { ComputationQueue } from '../classes/ComputationQueue';
import {
  PipelineMachineInfo,
  PipelineMachineInfoInput,
} from '../../../core/pipeline/classes/PipelineMachineInfo';
import { ComputationResultModel } from '../models/ComputationResultModel';
import { OptimizationResult } from '../classes/OptimizationResult';
import {
  ClassificationMetric,
  ComputationResult,
  ComputationResultPayload,
} from '../classes/ComputationResult';
import { GraphManager } from '../../experiments/services/GraphManager';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../../experiments/models/GraphStructureModel';
import { ExperimentStatus } from '../../experiments/classes/ExperimentStatus';
import { ClassificationStage } from '../../experiments/classes/ClassificationStage';
import { buildGraphPaths } from '../../experiments/utils/buildGraphPaths';
import { CompleteExperimentRunInput } from '../classes/CompleteExperimentRunInput';
import { FailExperimentRunInput } from '../classes/FailExperimentRunInput';
import { ComputationMode } from '../../experiments/classes/ComputationMode';
import { OptimizationRunner } from './OptimizationRunner';
import { EnqueueExperimentRunsInput } from '../classes/EnqueueExperimentRunsInput';
import { Pipeline, PipelineBaseService, PipelineModel } from '../../../core/pipeline';
import { PipelineStatus } from '../../../core/pipeline/enums';
import { PipelineHistoryItem } from '../../../core/pipeline/classes/PipelineHistoryItem';
import { WorkflowManager } from '../../../core/workflow/services/WorkflowManager';
import { WorkflowType } from '../../../core/workflow/enums';

export class ComputationManager {
  private readonly graphManager = new GraphManager();
  private batchClient: BatchClient | null = null;
  private readonly optimizationRunner = new OptimizationRunner();
  private readonly workflowManager = new WorkflowManager();

  async listResultsByExperiment(experimentId: string): Promise<ComputationResult[]> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    return ComputationResultModel.find({ experimentId: trimmedId }).sort({ createdAt: -1 }).lean();
  }

  async optimizeExperimentRuns(experimentId: string): Promise<OptimizationResult> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    const graph = await GraphStructureModel.findOne({ experimentId: trimmedId }).lean();
    const metrics = graph?.settings?.metrics;
    if (!metrics) {
      throw new Error('Graph metrics are not configured.');
    }

    const rawResults = await ComputationResultModel.find({ experimentId: trimmedId })
      .sort({ createdAt: -1 })
      .lean();
    if (rawResults.length === 0) {
      throw new Error('Computation results are missing for optimization.');
    }

    const seenPaths = new Set<string>();
    const conveyors = rawResults
      .map((result) => {
        const pathNodeIds = (result.pathNodeIds ?? []).map((id) => String(id));
        const pathKey = pathNodeIds.join('.');
        if (!pathKey || seenPaths.has(pathKey)) return null;
        seenPaths.add(pathKey);

        let payload: Record<string, unknown> | null = null;
        let payloadJson: string | null = null;
        if (result.payloadJson) {
          payloadJson = result.payloadJson;
          try {
            payload = JSON.parse(result.payloadJson) as Record<string, unknown>;
            payloadJson = null;
          } catch {
            payload = null;
          }
        } else if (result.payload) {
          payload = result.payload as Record<string, unknown>;
        }

        return {
          run_id: String(result.runId),
          path_node_ids: pathNodeIds,
          payload,
          payload_json: payloadJson,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (conveyors.length === 0) {
      throw new Error('No completed paths available for optimization.');
    }

    const optimization = await this.optimizationRunner.run({
      weights: {
        accuracy: metrics.accuracy,
        f1: metrics.f1,
        rocAuc: metrics.rocAuc,
        ntps: metrics.ntps,
      },
      conveyors,
    });

    if (!optimization.best) {
      throw new Error('Optimization failed to select a path.');
    }

    return {
      runId: optimization.best.run_id,
      pathNodeIds: optimization.best.path_node_ids,
      score: optimization.best.score,
    };
  }

  async enqueueRuns(input: EnqueueExperimentRunsInput): Promise<Pipeline[]> {
    const { experimentId, queue, pipelineId, rerun, runAll } = input;
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
      throw new Error('Усі шляхи мають містити етап класифікації.');
    }

    let pathsToEnqueue: string[][] = [];
    if (runAll) {
      pathsToEnqueue = paths;
    } else if (pipelineId) {
      const pipeline = await PipelineBaseService.getById(pipelineId);
      const normalizedPath = pipeline.pathNodeIds.map((id) => {
        if (!Types.ObjectId.isValid(id)) {
          throw new Error(`Invalid graph node id: ${id}`);
        }
        return id.toString();
      });
      const pathKeys = new Set(paths.map((path) => path.join('.')));
      const normalizedKey = normalizedPath.join('.');
      if (!pathKeys.has(normalizedKey)) {
        throw new Error('Selected path is not present in the graph.');
      }
      pathsToEnqueue = [normalizedPath];
    }

    const pipelines = await PipelineBaseService.listByExperiment(experimentId);
    const existingPathKeys = new Set(
      pipelines.map((run) => run.pathNodeIds.map((id) => String(id)).join('.'))
    );
    const dedupedPaths = pathsToEnqueue.filter((path) => !existingPathKeys.has(path.join('.')));
    if (!rerun && dedupedPaths.length === 0) {
      throw new Error(runAll ? 'Усі шляхи вже мають обчислення.' : 'Цей шлях уже має обчислення.');
    }

    const docs = dedupedPaths.map((path) => ({
      experimentId,
      queue: input.queue,
      status: PipelineStatus.queued,
      progress: 0,
      statusMessage: 'В черзі',
      priority: 0,
      pathNodeIds: path.map((id) => new Types.ObjectId(id)),
    }));

    const created = await PipelineModel.insertMany(docs, { ordered: true });
    await ExperimentModel.updateOne(
      { _id: experimentId },
      { $set: { status: ExperimentStatus.computing } }
    ).exec();
    return created.map((doc) => doc.toObject({ getters: true })) as Pipeline[];
  }

  async stopRun(pipelineId: string): Promise<Pipeline> {
    const pipeline = await PipelineBaseService.getById(pipelineId);
    const workflow = await this.workflowManager.getWorkflow({
      instanceId: pipeline._id,
      type: WorkflowType.PIPELINE,
    });
    if (
      workflow.status === PipelineStatus.completed ||
      workflow.status === PipelineStatus.failed ||
      workflow.status === PipelineStatus.stopped
    ) {
      return pipeline;
    }
    return pipeline;
  }

  async claimNextRun(
    queue: ComputationQueue,
    machineInfo?: PipelineMachineInfoInput
  ): Promise<Pipeline | null> {
    const normalizedMachineInfo = this.normalizeMachineInfo(queue, machineInfo);
    const updateSet: Record<string, unknown> = {
      status: PipelineStatus.running,
      progress: 0,
      statusMessage: 'Запущено',
      priority: 0,
    };
    if (normalizedMachineInfo) {
      updateSet.machineInfo = normalizedMachineInfo;
    }

    const run = await PipelineModel.findOneAndUpdate(
      { queue, status: PipelineStatus.queued },
      { $set: updateSet },
      { sort: { priority: -1, createdAt: 1 }, new: true }
    ).lean();

    if (run && normalizedMachineInfo) {
      await this.registerMachineInfo(run.experimentId, normalizedMachineInfo);
    }

    return run;
  }

  async completeRun(input: CompleteExperimentRunInput): Promise<Pipeline> {
    const trimmedId = input.runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

    const run = await PipelineModel.findById(trimmedId).lean();
    if (!run) throw new Error('Computation run not found');
    // if (run.status === PipelineStatus.paused) {
    //   return run;
    // }

    const rawResult = input.resultJson?.trim();
    let parsedPayload: Record<string, unknown> | null = null;
    if (rawResult) {
      try {
        parsedPayload = JSON.parse(rawResult) as Record<string, unknown>;
      } catch {
        throw new Error('Result JSON is invalid');
      }
    }
    const structuredPayload = parsedPayload ? this.buildResultPayload(parsedPayload) : null;
    const historyFromPayload = parsedPayload ? this.parseHistoryEntries(parsedPayload.history) : [];

    await ComputationResultModel.create({
      runId: run._id,
      experimentId: run.experimentId,
      pathNodeIds: run.pathNodeIds,
      payloadJson: rawResult
        ? rawResult
        : parsedPayload
          ? JSON.stringify(parsedPayload)
          : undefined,
      ...(structuredPayload ? { payload: structuredPayload } : {}),
    });

    const statusMessage = input.statusMessage?.trim() || 'Завершено';
    const completionEntry = this.buildHistoryEntry(statusMessage);
    const historyUpdates = this.mergeHistoryEntries(run.history, [
      ...historyFromPayload,
      completionEntry,
    ]);
    const updateOps: Record<string, unknown> = {
      $set: {
        status: PipelineStatus.completed,
        progress: 100,
        statusMessage,
      },
    };
    if (historyUpdates.length > 0) {
      updateOps.$push = { history: { $each: historyUpdates } };
    }
    const updated = await PipelineModel.findByIdAndUpdate(trimmedId, updateOps, {
      new: true,
    }).lean();

    if (!updated) throw new Error('Computation run not found');
    await this.syncExperimentStatus(String(run.experimentId));
    return updated;
  }

  async failRun(input: FailExperimentRunInput): Promise<Pipeline> {
    const trimmedId = input.runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

    const existing = await PipelineModel.findById(trimmedId).lean();
    if (!existing) throw new Error('Computation run not found');
    // if (existing.status === PipelineStatus.paused) {
    //   return existing;
    // }

    const statusMessage = input.statusMessage?.trim() || 'Помилка';
    const failureEntry = this.buildHistoryEntry(statusMessage);
    const historyUpdates = this.mergeHistoryEntries(existing.history, [failureEntry]);
    const updateOps: Record<string, unknown> = {
      $set: {
        status: PipelineStatus.failed,
        statusMessage,
      },
    };
    if (historyUpdates.length > 0) {
      updateOps.$push = { history: { $each: historyUpdates } };
    }
    const updated = await PipelineModel.findByIdAndUpdate(trimmedId, updateOps, {
      new: true,
    }).lean();
    if (!updated) throw new Error('Computation run not found');
    await this.syncExperimentStatus(String(existing.experimentId));
    return updated;
  }

  async pauseExperimentRuns(experimentId: string): Promise<Pipeline[]> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    const experimentObjectId = new Types.ObjectId(trimmedId);
    const runs = await PipelineModel.find({
      experimentId: experimentObjectId,
      status: { $in: [PipelineStatus.queued, PipelineStatus.running] },
    }).lean();

    if (runs.length === 0) return [];

    const runIds = runs.map((run) => run._id);
    await PipelineModel.updateMany(
      { _id: { $in: runIds } },
      {
        $set: {
          status: PipelineStatus.paused,
          statusMessage: 'Пауза',
        },
      }
    );

    const cloudJobs = runs.filter((run) => run.queue === ComputationQueue.cloud && run.cloudJobId);
    for (const run of cloudJobs) {
      if (run.cloudJobId) {
        await this.cancelCloudJob(run.cloudJobId);
      }
    }

    return PipelineModel.find({ _id: { $in: runIds } }).lean();
  }

  async resumeExperimentRuns(experimentId: string): Promise<Pipeline[]> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    const experimentObjectId = new Types.ObjectId(trimmedId);
    const runs = await PipelineModel.find({
      experimentId: experimentObjectId,
      status: PipelineStatus.paused,
    }).lean();

    if (runs.length === 0) return [];

    const runIds = runs.map((run) => run._id);
    await PipelineModel.updateMany(
      { _id: { $in: runIds } },
      {
        $set: {
          status: PipelineStatus.queued,
          progress: 0,
          statusMessage: 'В черзі',
          priority: 1,
        },
        $unset: {
          cloudJobId: '',
        },
      }
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
      (host) =>
        String(host.queue ?? '') === String(machineInfo.queue ?? '') &&
        String(host.hostname ?? '') === String(machineInfo.hostname ?? '')
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

  private async cancelCloudJob(jobId: string) {
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
        console.warn('Failed to cancel AWS job', innerError);
      }
    }
  }

  private async syncExperimentStatus(experimentId: string): Promise<void> {
    // const runs: Pick<Pipeline, 'status'>[] = await PipelineModel.find({ experimentId })
    //   .select('status')
    //   .lean();
    const runs: any[] = [];
    if (runs.length === 0) return;

    const hasActive = runs.some(
      (run) =>
        run.status === PipelineStatus.queued ||
        run.status === PipelineStatus.running ||
        run.status === PipelineStatus.paused
    );
    const nextStatus = hasActive ? ExperimentStatus.computing : ExperimentStatus.completed;

    await ExperimentModel.updateOne({ _id: experimentId }, { $set: { status: nextStatus } }).exec();
  }

  private buildResultPayload(raw: Record<string, unknown>): ComputationResultPayload | null {
    const payload: ComputationResultPayload = {};
    const classMetrics: ClassificationMetric[] = [];

    Object.entries(raw).forEach(([key, value]) => {
      const normalizedKey = key.trim().toLowerCase();

      if (normalizedKey === 'accuracy') {
        const accuracy = this.toNumber(value);
        if (accuracy !== null) {
          payload.accuracy = accuracy;
        }
        return;
      }

      if (
        normalizedKey === 'accuracy_scores' ||
        normalizedKey === 'accuracy-scores' ||
        normalizedKey === 'accuracyscores'
      ) {
        const scores = this.toNumberArray(value);
        if (scores?.length) {
          payload.accuracyScores = scores;
        }
        return;
      }

      if (
        normalizedKey === 'f1_scores' ||
        normalizedKey === 'f1-scores' ||
        normalizedKey === 'f1scores'
      ) {
        const scores = this.toNumberArray(value);
        if (scores?.length) {
          payload.f1Scores = scores;
        }
        return;
      }

      if (
        normalizedKey === 'roc_auc_scores' ||
        normalizedKey === 'roc-auc-scores' ||
        normalizedKey === 'rocaucscores'
      ) {
        const scores = this.toNumberArray(value);
        if (scores?.length) {
          payload.rocAucScores = scores;
        }
        return;
      }

      if (
        normalizedKey === 'macro avg' ||
        normalizedKey === 'macro_avg' ||
        normalizedKey === 'macroavg'
      ) {
        const metric = this.parseMetric('macro avg', value);
        if (metric) {
          payload.macroAvg = metric;
        }
        return;
      }

      if (
        normalizedKey === 'weighted avg' ||
        normalizedKey === 'weighted_avg' ||
        normalizedKey === 'weightedavg'
      ) {
        const metric = this.parseMetric('weighted avg', value);
        if (metric) {
          payload.weightedAvg = metric;
        }
        return;
      }

      if (normalizedKey === 'path_length' || normalizedKey === 'pathlength') {
        const pathLength = this.toNumber(value);
        if (pathLength !== null) {
          payload.pathLength = pathLength;
        }
        return;
      }

      if (
        normalizedKey === 'sample_count' ||
        normalizedKey === 'samples' ||
        normalizedKey === 'records_count' ||
        normalizedKey === 'samplecount'
      ) {
        const sampleCount = this.toNumber(value);
        if (sampleCount !== null) {
          payload.sampleCount = sampleCount;
        }
        return;
      }

      if (
        normalizedKey === 'duration_seconds' ||
        normalizedKey === 'duration_sec' ||
        normalizedKey === 'duration' ||
        normalizedKey === 'path_duration' ||
        normalizedKey === 'path_duration_seconds'
      ) {
        const durationSeconds = this.toNumber(value);
        if (durationSeconds !== null) {
          payload.durationSeconds = durationSeconds;
        }
        return;
      }

      if (
        normalizedKey === 'confusion_matrix' ||
        normalizedKey === 'confusionmatrix' ||
        normalizedKey === 'confusion'
      ) {
        const matrix = this.toNumberMatrix(value);
        if (matrix?.length) {
          payload.confusionMatrix = matrix;
        }
        return;
      }

      if (normalizedKey === 'class_labels' || normalizedKey === 'classlabels') {
        const labels = this.toStringArray(value);
        if (labels?.length) {
          payload.classLabels = labels;
        }
        return;
      }

      if (normalizedKey === 'class_count' || normalizedKey === 'classcount') {
        const classCount = this.toNumber(value);
        if (classCount !== null) {
          payload.classCount = classCount;
        }
        return;
      }

      if (normalizedKey === 'completed_at' || normalizedKey === 'completedat') {
        if (typeof value === 'string' && value.trim()) {
          payload.completedAt = value.trim();
        }
        return;
      }

      if (normalizedKey === 'nodes' && Array.isArray(value)) {
        const nodes = value
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean);
        if (nodes.length > 0) {
          payload.nodes = nodes;
        }
        return;
      }

      const metric = this.parseMetric(key, value);
      if (metric) {
        classMetrics.push(metric);
      }
    });

    if (classMetrics.length > 0) {
      payload.classes = classMetrics;
    }

    const hasPayload =
      payload.accuracy !== undefined ||
      Boolean(payload.accuracyScores?.length) ||
      Boolean(payload.f1Scores?.length) ||
      Boolean(payload.rocAucScores?.length) ||
      payload.macroAvg !== undefined ||
      payload.weightedAvg !== undefined ||
      Boolean(payload.classes?.length) ||
      payload.sampleCount !== undefined ||
      payload.durationSeconds !== undefined ||
      Boolean(payload.confusionMatrix?.length) ||
      Boolean(payload.classLabels?.length) ||
      payload.classCount !== undefined ||
      payload.pathLength !== undefined ||
      Boolean(payload.nodes?.length) ||
      payload.completedAt !== undefined;

    return hasPayload ? payload : null;
  }

  private parseMetric(label: string, value: unknown): ClassificationMetric | null {
    if (!value || typeof value !== 'object') return null;
    const raw = value as Record<string, unknown>;

    const precision = this.toNumber(raw.precision);
    const recall = this.toNumber(raw.recall);
    const f1Score = this.toNumber(raw['f1-score'] ?? raw.f1Score ?? raw.f1_score);
    const support = this.toNumber(raw.support);

    if (precision === null || recall === null || f1Score === null || support === null) {
      return null;
    }

    return {
      label: label.trim(),
      precision,
      recall,
      f1Score,
      support,
    };
  }

  private buildHistoryEntry(message: string, timestamp?: Date): PipelineHistoryItem {
    return {
      message: message.trim(),
      createdAt: timestamp ?? new Date(),
    };
  }

  private parseHistoryEntries(value: unknown): PipelineHistoryItem[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry) return null;
        if (typeof entry === 'string') {
          return this.buildHistoryEntry(entry);
        }
        if (typeof entry === 'object') {
          const raw = entry as Record<string, unknown>;
          const message = typeof raw.message === 'string' ? raw.message.trim() : '';
          if (!message) return null;
          const timestampRaw =
            raw.createdAt ?? raw.created_at ?? raw.timestamp ?? raw.time ?? raw.at ?? null;
          const timestamp =
            typeof timestampRaw === 'string' && timestampRaw.trim()
              ? new Date(timestampRaw)
              : timestampRaw instanceof Date
                ? timestampRaw
                : null;
          const normalizedTimestamp =
            timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp : undefined;
          return this.buildHistoryEntry(message, normalizedTimestamp);
        }
        return null;
      })
      .filter((entry): entry is PipelineHistoryItem => Boolean(entry?.message));
  }

  private mergeHistoryEntries(
    existing: PipelineHistoryItem[] | undefined,
    incoming: PipelineHistoryItem[]
  ): PipelineHistoryItem[] {
    if (!incoming.length) return [];
    const merged: PipelineHistoryItem[] = [];
    const lastExistingMessage = existing?.[existing.length - 1]?.message;
    incoming.forEach((entry) => {
      const lastMessage = merged.length ? merged[merged.length - 1]?.message : lastExistingMessage;
      if (entry.message && entry.message !== lastMessage) {
        merged.push(entry);
      }
    });
    return merged;
  }

  private toNumberArray(value: unknown): number[] | null {
    if (!Array.isArray(value)) return null;
    const numbers = value
      .map((entry) => this.toNumber(entry))
      .filter((entry): entry is number => entry !== null);
    return numbers.length > 0 ? numbers : null;
  }

  private toNumberMatrix(value: unknown): number[][] | null {
    if (!Array.isArray(value)) return null;
    const matrix = value
      .map((row) => {
        if (!Array.isArray(row)) return null;
        const numbers = row
          .map((entry) => this.toNumber(entry))
          .filter((entry): entry is number => entry !== null);
        return numbers.length > 0 ? numbers : null;
      })
      .filter((row): row is number[] => Boolean(row));
    return matrix.length > 0 ? matrix : null;
  }

  private toStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const values = value
      .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
      .filter(Boolean);
    return values.length > 0 ? values : null;
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim()) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
  }
}
