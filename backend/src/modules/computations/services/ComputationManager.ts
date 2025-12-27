import { Types } from 'mongoose';
import { ComputationRun } from '../classes/ComputationRun';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ComputationStatus } from '../classes/ComputationStatus';
import { ComputationRunModel } from '../models/ComputationRunModel';
import { ComputationResultModel } from '../models/ComputationResultModel';
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
    }).lean<ComputationRun>();
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
      pathNodeIds: path.map((id) => new Types.ObjectId(id)),
    }));

    const created = await ComputationRunModel.insertMany(docs, { ordered: true });
    return created.map((doc) => doc.toObject({ getters: true })) as ComputationRun[];
  }

  async claimNextRun(queue: ComputationQueue): Promise<ComputationRun | null> {
    return ComputationRunModel.findOneAndUpdate(
      { queue, status: ComputationStatus.queued },
      {
        $set: {
          status: ComputationStatus.running,
          progress: 0,
          statusMessage: 'Запущено',
        },
      },
      { sort: { createdAt: 1 }, new: true }
    ).lean<ComputationRun>();
  }

  async updateRun(input: UpdateExperimentRunInput): Promise<ComputationRun> {
    const trimmedId = input.runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

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
    ).lean<ComputationRun>();
    if (!updated) throw new Error('Computation run not found');
    return updated;
  }

  async completeRun(input: CompleteExperimentRunInput): Promise<ComputationRun> {
    const trimmedId = input.runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

    const run = await ComputationRunModel.findById(trimmedId).lean<ComputationRun>();
    if (!run) throw new Error('Computation run not found');

    const rawResult = input.resultJson?.trim();
    let payload: Record<string, unknown> = {};
    if (rawResult) {
      try {
        payload = JSON.parse(rawResult) as Record<string, unknown>;
      } catch {
        throw new Error('Result JSON is invalid');
      }
    }

    await ComputationResultModel.create({
      runId: run._id,
      experimentId: run.experimentId,
      pathNodeIds: run.pathNodeIds,
      payload,
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
    ).lean<ComputationRun>();

    if (!updated) throw new Error('Computation run not found');
    return updated;
  }

  async failRun(input: FailExperimentRunInput): Promise<ComputationRun> {
    const trimmedId = input.runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

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
    ).lean<ComputationRun>();
    if (!updated) throw new Error('Computation run not found');
    return updated;
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
}
