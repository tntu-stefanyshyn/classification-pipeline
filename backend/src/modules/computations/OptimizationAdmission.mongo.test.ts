import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import mongoose, { Types } from 'mongoose';

import { PipelineStatus } from '../../core/pipeline/enums';
import { PipelineModel } from '../../core/pipeline/models/PipelineModel';
import { WorkflowType } from '../../core/workflow/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { ClassificationStage } from '../experiments/classes/ClassificationStage';
import { ExperimentStatus } from '../experiments/classes/ExperimentStatus';
import { OptimizationStatus } from '../experiments/classes/OptimizationStatus';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../experiments/models/GraphStructureModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { ComputationManager } from './services/ComputationManager';

// Optimization startup and re-run admission are settled by conditional updates, so they are tested
// against a real MongoDB. CI provides the database (see Dockerfile.ci).
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `optimization-test-${process.pid}-${Date.now()}` });
  await PipelineModel.init();
  await WorkflowModel.init();
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
};

// An experiment that was optimized before and whose only run has been re-run and completed.
const seed = async (status: ExperimentStatus) => {
  const experiment = await ExperimentModel.create({
    createdById: new Types.ObjectId(),
    name: 'experiment',
    optimization: {
      status: OptimizationStatus.completed,
      bestPipelineId: new Types.ObjectId(),
    },
  });
  const nodeId = new Types.ObjectId();
  const graph = await GraphStructureModel.create({
    experimentId: experiment._id,
    nodes: [
      {
        _id: nodeId,
        label: 'SVM',
        stage: ClassificationStage.CLASSIFICATION,
        technology: 'SVM',
        type: 'stage',
        settings: [],
      },
    ],
    settings: {
      metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
      queues: [ComputationQueue.local],
      folds: 5,
      predictDataPercent: 20,
      hyperOptimizationMinutesPerPipeline: 1,
    },
  });
  const run = await PipelineModel.create({
    experimentId: experiment._id,
    graphStructureId: graph._id,
    queue: ComputationQueue.local,
    pathNodeIds: [nodeId],
  });
  await WorkflowModel.create([
    { type: WorkflowType.EXPERIMENT, instanceId: experiment._id, status },
    { type: WorkflowType.PIPELINE, instanceId: run._id, status: PipelineStatus.completed },
  ]);
  return { experimentId: experiment._id, source: run.toObject({ getters: true }) };
};

// A runner that takes a while and has not published any progress yet, like a starting container.
const slowRunner = (manager: any, starts: { count: number }) => {
  manager.optimizationRunner = {
    run: async () => {
      starts.count += 1;
      await new Promise((resolve) => setTimeout(resolve, 150));
    },
  };
  manager.getOptimizationResult = async () => ({ runId: 'run', pathNodeIds: [], score: 0 });
};

const statusOf = async (experimentId: Types.ObjectId) =>
  (await WorkflowModel.findOne({ instanceId: experimentId, type: WorkflowType.EXPERIMENT }).lean())
    ?.status;

test('simultaneous optimizations start one runner', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId } = await seed(ExperimentStatus.computing);
  const manager = new ComputationManager() as any;
  const starts = { count: 0 };
  slowRunner(manager, starts);

  const results = await Promise.allSettled([
    manager.optimize(experimentId),
    manager.optimize(experimentId),
    manager.optimize(experimentId),
  ]);

  assert.equal(starts.count, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  for (const result of results) {
    if (result.status === 'rejected') assert.match(String(result.reason), /вже виконується/);
  }
});

test(
  'simultaneous completions of the last re-run start one automatic optimization',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.computing);
    const manager = new ComputationManager() as any;
    const starts = { count: 0 };
    slowRunner(manager, starts);

    await Promise.all([
      manager.reoptimizeAfterRerun(source._id),
      manager.reoptimizeAfterRerun(source._id),
      manager.reoptimizeAfterRerun(source._id),
    ]);

    assert.equal(starts.count, 1);
    assert.equal(await statusOf(experimentId), ExperimentStatus.completed);
  }
);

test(
  'a re-run admitted between the completion check and the transition is rejected',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.computing);
    const manager = new ComputationManager() as any;
    const starts = { count: 0 };
    slowRunner(manager, starts);
    const outcome: { rerun?: unknown } = {};
    // The window the reviewer reproduced: optimize is between its checks and the end of its start.
    const check = manager.hasUncomputedRun.bind(manager);
    manager.hasUncomputedRun = async (id: Types.ObjectId) => {
      outcome.rerun = await manager.prepareRerun(source).then(
        () => 'admitted',
        (error: Error) => error.message
      );
      return check(id);
    };

    await manager.optimize(experimentId);

    assert.match(String(outcome.rerun), /оптимізації/);
    assert.equal(await PipelineModel.countDocuments({ experimentId }), 1);
    assert.equal(starts.count, 1);
  }
);

test(
  'a re-run admitted before the attempt is claimed stops the optimization and undoes the claim',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.completed);
    const manager = new ComputationManager() as any;
    // Reopening a completed experiment checks its CSV file; the file is not what is tested here.
    manager.experimentManager.ensureExperimentFileReady = async () => undefined;
    const starts = { count: 0 };
    slowRunner(manager, starts);
    const claim = manager.claimOptimization.bind(manager);
    let admitted = false;
    manager.claimOptimization = async (...args: unknown[]) => {
      // The re-run gets in just before optimize takes ownership: its run exists and is not completed.
      if (!admitted) {
        admitted = true;
        await manager.prepareRerun(source);
      }
      return claim(...args);
    };

    await assert.rejects(() => manager.optimize(experimentId), /uncomuted pipelines/);

    assert.equal(starts.count, 0);
    // The claim is given back: the experiment is reopened for the re-run, the mark is as it was.
    assert.equal(await statusOf(experimentId), ExperimentStatus.computing);
    const experiment = await ExperimentModel.findById(experimentId).lean();
    assert.equal(experiment?.optimization?.status, OptimizationStatus.completed);
    assert.equal(await PipelineModel.countDocuments({ experimentId }), 2);
  }
);

test('a failed attempt keeps its optimization status and can be retried', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId } = await seed(ExperimentStatus.computing);
  const manager = new ComputationManager() as any;
  manager.optimizationRunner = {
    run: async () => {
      throw new Error('container failed');
    },
  };

  await assert.rejects(() => manager.optimize(experimentId), /container failed/);

  assert.equal(await statusOf(experimentId), ExperimentStatus.optimization);
  const failed = await ExperimentModel.findById(experimentId).lean();
  assert.equal(failed?.optimization?.status, OptimizationStatus.failed);

  const starts = { count: 0 };
  slowRunner(manager, starts);
  await manager.optimize(experimentId);
  assert.equal(starts.count, 1);
});
