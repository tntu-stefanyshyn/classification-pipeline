import { Types } from 'mongoose';
import { ComputationRun } from '../classes/ComputationRun';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ComputationStatus } from '../classes/ComputationStatus';
import { ComputationRunModel } from '../models/ComputationRunModel';
import { GraphManager } from '../../experiments/services/GraphManager';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { ExperimentStatus } from '../../experiments/classes/ExperimentStatus';
import { ClassificationStage } from '../../experiments/classes/ClassificationStage';
import { buildGraphPaths } from '../../experiments/utils/buildGraphPaths';

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

    const runs = await ComputationRunModel.find(filter)
      .sort({ createdAt: -1 })
      .lean<ComputationRun>()
      .exec();
    await this.syncExperimentStatus(trimmedId);
    return runs;
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
    await ExperimentModel.updateOne(
      { _id: experimentObjectId },
      { $set: { status: ExperimentStatus.computing } }
    ).exec();
    return created.map((doc) => doc.toObject({ getters: true })) as ComputationRun[];
  }

  async stopRun(runId: string): Promise<ComputationRun> {
    const trimmedId = runId.trim();
    if (!trimmedId) throw new Error('Run _id is required');
    if (!Types.ObjectId.isValid(trimmedId)) throw new Error('Run _id is invalid');

    const run = await ComputationRunModel.findById(trimmedId);
    if (!run) throw new Error('Computation run not found');

    if (
      run.status === ComputationStatus.completed ||
      run.status === ComputationStatus.failed ||
      run.status === ComputationStatus.stopped
    ) {
      return run.toObject({ getters: true }) as ComputationRun;
    }

    run.status = ComputationStatus.stopped;
    await run.save();
    await this.syncExperimentStatus(String(run.experimentId));

    return run.toObject({ getters: true }) as ComputationRun;
  }

  private async syncExperimentStatus(experimentId: string): Promise<void> {
    const runs = await ComputationRunModel.find({ experimentId })
      .select('status')
      .lean<Pick<ComputationRun, 'status'>>()
      .exec();
    if (runs.length === 0) return;

    const hasActive = runs.some(
      (run) => run.status === ComputationStatus.queued || run.status === ComputationStatus.running
    );
    const nextStatus = hasActive ? ExperimentStatus.computing : ExperimentStatus.completed;

    await ExperimentModel.updateOne({ _id: experimentId }, { $set: { status: nextStatus } }).exec();
  }
}
