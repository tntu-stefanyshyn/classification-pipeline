import { BatchClient, CancelJobCommand, TerminateJobCommand } from '@aws-sdk/client-batch';
import { Types } from 'mongoose';
import { config } from '../../../config/config';
import { ComputationRun } from '../classes/ComputationRun';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ComputationStatus } from '../classes/ComputationStatus';
import {
  ComputationMachineInfo,
  ComputationMachineInfoInput,
} from '../classes/ComputationMachineInfo';
import { ComputationRunModel } from '../models/ComputationRunModel';
import { ComputationResultModel } from '../models/ComputationResultModel';
import { ClassificationMetric, ComputationResult, ComputationResultPayload } from '../classes/ComputationResult';
import { GraphManager } from '../../experiments/services/GraphManager';
import type { GraphNode } from '../../experiments/classes/GraphNode';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { UpdateExperimentRunInput } from '../classes/UpdateExperimentRunInput';
import { CompleteExperimentRunInput } from '../classes/CompleteExperimentRunInput';
import { FailExperimentRunInput } from '../classes/FailExperimentRunInput';
import { ComputationMode } from '../../experiments/classes/ComputationMode';

type EnqueueRunsInput = {
  experimentId: string;
  queue: ComputationQueue;
  pathNodeIds?: string[];
  runAll?: boolean;
};

export class ComputationManager {
  private readonly graphManager = new GraphManager();
  private batchClient: BatchClient | null = null;

  async listByExperiment(
    experimentId: string,
    queue?: ComputationQueue
  ): Promise<ComputationRun[]> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    const filter: Record<string, unknown> = { experimentId: trimmedId };
    if (queue) {
      filter.queue = queue;
    }

    return ComputationRunModel.find(filter).sort({ createdAt: -1 }).lean();
  }

  async listResultsByExperiment(experimentId: string): Promise<ComputationResult[]> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    return ComputationResultModel.find({ experimentId: trimmedId }).sort({ createdAt: -1 }).lean();
  }

  async getRunById(runId: string): Promise<ComputationRun | null> {
    const trimmedId = runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

    return ComputationRunModel.findById(trimmedId).lean();
  }

  async enqueueRuns(input: EnqueueRunsInput): Promise<ComputationRun[]> {
    const trimmedId = input.experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    const runAll = Boolean(input.runAll);
    const pathNodeIds = (input.pathNodeIds ?? []).map((id) => id.trim()).filter(Boolean);
    if (runAll && pathNodeIds.length > 0) {
      throw new Error('Provide either runAll or pathNodeIds, not both.');
    }
    if (!runAll && pathNodeIds.length === 0) {
      throw new Error('Path node ids are required for a single run.');
    }

    const experiment = await ExperimentModel.findById(trimmedId).lean();
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const graph = await this.graphManager.getByExperimentId(trimmedId);
    const computationMode = graph.computationMode ?? ComputationMode.both;
    if (computationMode === ComputationMode.local && input.queue !== ComputationQueue.local) {
      throw new Error('Цей граф дозволяє лише локальні обчислення.');
    }
    if (computationMode === ComputationMode.cloud && input.queue !== ComputationQueue.cloud) {
      throw new Error('Цей граф дозволяє лише хмарні обчислення.');
    }
    const paths = this.buildPaths(graph.nodes ?? []);
    if (paths.length === 0) {
      throw new Error('Graph has no paths to run.');
    }

    let pathsToEnqueue: string[][] = [];
    if (runAll) {
      pathsToEnqueue = paths;
    } else {
      const normalizedPath = pathNodeIds.map((id) => {
        if (!Types.ObjectId.isValid(id)) {
          throw new Error(`Invalid graph node id: ${id}`);
        }
        return id;
      });
      const pathKeys = new Set(paths.map((path) => path.join('.')));
      const normalizedKey = normalizedPath.join('.');
      if (!pathKeys.has(normalizedKey)) {
        throw new Error('Selected path is not present in the graph.');
      }
      pathsToEnqueue = [normalizedPath];
    }

    const experimentObjectId = new Types.ObjectId(trimmedId);
    const existingRuns = await ComputationRunModel.find({
      experimentId: experimentObjectId,
    }).lean();
    const existingPathKeys = new Set(
      existingRuns.map((run) => run.pathNodeIds.map((id) => String(id)).join('.'))
    );
    const dedupedPaths = pathsToEnqueue.filter((path) => !existingPathKeys.has(path.join('.')));
    if (dedupedPaths.length === 0) {
      throw new Error(runAll ? 'Усі шляхи вже мають обчислення.' : 'Цей шлях уже має обчислення.');
    }

    const docs = dedupedPaths.map((path) => ({
      experimentId: experimentObjectId,
      queue: input.queue,
      status: ComputationStatus.queued,
      progress: 0,
      statusMessage: 'В черзі',
      priority: 0,
      pathNodeIds: path.map((id) => new Types.ObjectId(id)),
    }));

    const created = await ComputationRunModel.insertMany(docs, { ordered: true });
    return created.map((doc) => doc.toObject({ getters: true })) as ComputationRun[];
  }

  async claimNextRun(
    queue: ComputationQueue,
    machineInfo?: ComputationMachineInfoInput
  ): Promise<ComputationRun | null> {
    const normalizedMachineInfo = this.normalizeMachineInfo(queue, machineInfo);
    const updateSet: Record<string, unknown> = {
      status: ComputationStatus.running,
      progress: 0,
      statusMessage: 'Запущено',
      priority: 0,
    };
    if (normalizedMachineInfo) {
      updateSet.machineInfo = normalizedMachineInfo;
    }

    const run = await ComputationRunModel.findOneAndUpdate(
      { queue, status: ComputationStatus.queued },
      { $set: updateSet },
      { sort: { priority: -1, createdAt: 1 }, new: true }
    ).lean();

    if (run && normalizedMachineInfo) {
      await this.registerMachineInfo(run.experimentId, normalizedMachineInfo);
    }

    return run;
  }

  async updateRun(input: UpdateExperimentRunInput): Promise<ComputationRun> {
    const trimmedId = input.runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

    const existing = await ComputationRunModel.findById(trimmedId).lean();
    if (!existing) throw new Error('Computation run not found');
    if (existing.status === ComputationStatus.paused) {
      return existing;
    }

    const update: Record<string, unknown> = {};
    if (typeof input.progress === 'number' && Number.isFinite(input.progress)) {
      update.progress = Math.max(0, Math.min(100, Math.round(input.progress)));
    }
    if (typeof input.statusMessage === 'string') {
      update.statusMessage = input.statusMessage.trim();
    }
    if (Object.keys(update).length === 0) {
      throw new Error('Update data is required');
    }

    const updated = await ComputationRunModel.findByIdAndUpdate(
      trimmedId,
      { $set: update },
      { new: true }
    ).lean();
    if (!updated) throw new Error('Computation run not found');
    return updated;
  }

  async completeRun(input: CompleteExperimentRunInput): Promise<ComputationRun> {
    const trimmedId = input.runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

    const run = await ComputationRunModel.findById(trimmedId).lean();
    if (!run) throw new Error('Computation run not found');
    if (run.status === ComputationStatus.paused) {
      return run;
    }

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

    await ComputationResultModel.create({
      runId: run._id,
      experimentId: run.experimentId,
      pathNodeIds: run.pathNodeIds,
      payloadJson: rawResult ? rawResult : parsedPayload ? JSON.stringify(parsedPayload) : undefined,
      ...(structuredPayload ? { payload: structuredPayload } : {}),
    });

    const statusMessage = input.statusMessage?.trim() || 'Завершено';
    const updated = await ComputationRunModel.findByIdAndUpdate(
      trimmedId,
      {
        $set: {
          status: ComputationStatus.completed,
          progress: 100,
          statusMessage,
        },
      },
      { new: true }
    ).lean();

    if (!updated) throw new Error('Computation run not found');
    return updated;
  }

  async failRun(input: FailExperimentRunInput): Promise<ComputationRun> {
    const trimmedId = input.runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

    const existing = await ComputationRunModel.findById(trimmedId).lean();
    if (!existing) throw new Error('Computation run not found');
    if (existing.status === ComputationStatus.paused) {
      return existing;
    }

    const statusMessage = input.statusMessage?.trim() || 'Помилка';
    const updated = await ComputationRunModel.findByIdAndUpdate(
      trimmedId,
      {
        $set: {
          status: ComputationStatus.failed,
          statusMessage,
        },
      },
      { new: true }
    ).lean();
    if (!updated) throw new Error('Computation run not found');
    return updated;
  }

  async pauseExperimentRuns(experimentId: string): Promise<ComputationRun[]> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    const experimentObjectId = new Types.ObjectId(trimmedId);
    const runs = await ComputationRunModel.find({
      experimentId: experimentObjectId,
      status: { $in: [ComputationStatus.queued, ComputationStatus.running] },
    }).lean();

    if (runs.length === 0) return [];

    const runIds = runs.map((run) => run._id);
    await ComputationRunModel.updateMany(
      { _id: { $in: runIds } },
      {
        $set: {
          status: ComputationStatus.paused,
          statusMessage: 'Пауза',
        },
      }
    );

    const cloudJobs = runs.filter(
      (run) => run.queue === ComputationQueue.cloud && run.cloudJobId
    );
    for (const run of cloudJobs) {
      if (run.cloudJobId) {
        await this.cancelCloudJob(run.cloudJobId);
      }
    }

    return ComputationRunModel.find({ _id: { $in: runIds } }).lean();
  }

  async resumeExperimentRuns(experimentId: string): Promise<ComputationRun[]> {
    const trimmedId = experimentId.trim();
    if (!trimmedId) throw new Error('Experiment _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Experiment _id is invalid');

    const experimentObjectId = new Types.ObjectId(trimmedId);
    const runs = await ComputationRunModel.find({
      experimentId: experimentObjectId,
      status: ComputationStatus.paused,
    }).lean();

    if (runs.length === 0) return [];

    const runIds = runs.map((run) => run._id);
    await ComputationRunModel.updateMany(
      { _id: { $in: runIds } },
      {
        $set: {
          status: ComputationStatus.queued,
          progress: 0,
          statusMessage: 'В черзі',
          priority: 1,
        },
        $unset: {
          cloudJobId: '',
        },
      }
    );

    return ComputationRunModel.find({ _id: { $in: runIds } }).lean();
  }

  private normalizeMachineInfo(
    queue: ComputationQueue,
    input?: ComputationMachineInfoInput
  ): ComputationMachineInfo {
    const normalized: ComputationMachineInfo = {
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
    if (typeof input?.memoryGb === 'number' && Number.isFinite(input.memoryGb) && input.memoryGb > 0) {
      normalized.memoryGb = Math.round(input.memoryGb * 10) / 10;
    }

    const appVersion = trim(input?.appVersion);
    if (appVersion) normalized.appVersion = appVersion;

    return normalized;
  }

  private async registerMachineInfo(
    experimentId: Types.ObjectId,
    machineInfo: ComputationMachineInfo
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

  private buildPaths(nodes: GraphNode[]): string[][] {
    if (!nodes || nodes.length === 0) return [];
    const ids = new Set(nodes.map((node) => String(node._id)));
    const childrenByParent = new Map<string, string[]>();

    nodes.forEach((node) => {
      const nodeId = String(node._id);
      const parentId = node.parentId ? String(node.parentId) : '';
      if (!parentId || !ids.has(parentId)) return;
      const list = childrenByParent.get(parentId) ?? [];
      list.push(nodeId);
      childrenByParent.set(parentId, list);
    });

    const roots = nodes
      .filter((node) => {
        const parentId = node.parentId ? String(node.parentId) : '';
        return !parentId || !ids.has(parentId);
      })
      .map((node) => String(node._id));

    if (roots.length === 0) return [];

    const paths: string[][] = [];
    const visiting = new Set<string>();

    const dfs = (nodeId: string, path: string[]) => {
      if (visiting.has(nodeId)) return;
      visiting.add(nodeId);
      const nextPath = [...path, nodeId];
      const children = childrenByParent.get(nodeId) ?? [];
      if (children.length === 0) {
        paths.push(nextPath);
        visiting.delete(nodeId);
        return;
      }
      children.forEach((childId) => dfs(childId, nextPath));
      visiting.delete(nodeId);
    };

    roots.forEach((rootId) => dfs(rootId, []));
    return paths;
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

      if (normalizedKey === 'macro avg' || normalizedKey === 'macro_avg' || normalizedKey === 'macroavg') {
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
      payload.macroAvg !== undefined ||
      payload.weightedAvg !== undefined ||
      Boolean(payload.classes?.length) ||
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

    if (
      precision === null ||
      recall === null ||
      f1Score === null ||
      support === null
    ) {
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
