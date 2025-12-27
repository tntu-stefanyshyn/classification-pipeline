import { Types } from 'mongoose';
import { ComputationRun } from '../classes/ComputationRun';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ComputationStatus } from '../classes/ComputationStatus';
import { ComputationRunModel } from '../models/ComputationRunModel';
import { GraphManager } from '../../experiments/services/GraphManager';
import type { GraphNode } from '../../experiments/classes/GraphNode';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';

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

    return ComputationRunModel.find(filter).sort({ createdAt: -1 }).lean<ComputationRun>().exec();
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

    const experiment = await ExperimentModel.findById(trimmedId).lean().exec();
    if (!experiment) {
      throw new Error('Experiment not found');
    }

    const graph = await this.graphManager.getByExperimentId(trimmedId);
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
    const docs = pathsToEnqueue.map((path) => ({
      experimentId: experimentObjectId,
      queue: input.queue,
      status: ComputationStatus.queued,
      pathNodeIds: path.map((id) => new Types.ObjectId(id)),
    }));

    const created = await ComputationRunModel.insertMany(docs, { ordered: true });
    return created.map((doc) => doc.toObject({ getters: true })) as ComputationRun[];
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
