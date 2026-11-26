import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import mongoose, { Types } from 'mongoose';

import { PipelineStatus } from '../../core/pipeline/enums';
import { PipelineResolver } from '../../core/pipeline/graphql/pipeline';
import { PipelineModel } from '../../core/pipeline/models/PipelineModel';
import { WorkflowType } from '../../core/workflow/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { ClassificationStage } from '../experiments/classes/ClassificationStage';
import { ExperimentOperation } from '../experiments/enums';
import { ExperimentStatus } from '../experiments/classes/ExperimentStatus';
import { OptimizationStatus } from '../experiments/classes/OptimizationStatus';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../experiments/models/GraphStructureModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { ComputationManager } from './services/ComputationManager';

// Optimization attempts and re-run admissions are serialized by the experiment lock, a conditional
// update, so they are tested against a real MongoDB. CI provides the database (see Dockerfile.ci).
// Each test controls the order of the events by pausing one caller inside a step of the other.
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

// An experiment that was optimized before; its one run is completed.
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

// A runner that takes a while, like a starting container; `during` runs while it is "running".
const runner = (
  manager: any,
  starts: { count: number },
  during: () => Promise<void> = async () => undefined
) => {
  manager.optimizationRunner = {
    run: async () => {
      starts.count += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      await during();
    },
  };
  manager.getOptimizationResult = async () => ({ runId: 'run', pathNodeIds: [], score: 0 });
};

// The CSV check of a reopened experiment is not what these tests are about, except where set.
const createManager = (fileCheck: () => Promise<void> = async () => undefined): any => {
  const manager = new ComputationManager() as any;
  manager.experimentManager.ensureExperimentFileReady = fileCheck;
  manager.lockPollMs = 10;
  return manager;
};

const rerun = (experimentId: Types.ObjectId, source: { _id: Types.ObjectId }) => ({
  experimentId: String(experimentId),
  queue: ComputationQueue.local,
  pipelineId: String(source._id),
  rerun: true,
});

const statusOf = async (experimentId: Types.ObjectId) =>
  (await WorkflowModel.findOne({ instanceId: experimentId, type: WorkflowType.EXPERIMENT }).lean())
    ?.status;

const runStatuses = async (experimentId: Types.ObjectId) => {
  const runs = await PipelineModel.find({ experimentId }).lean();
  const workflows = await WorkflowModel.find({ instanceId: { $in: runs.map((run) => run._id) } })
    .lean()
    .then((items) => items.map((item) => item.status).sort());
  return { count: runs.length, statuses: workflows };
};

const waitFor = async (condition: () => Promise<boolean>, timeoutMs = 3000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail('the condition did not become true in time');
};

test('simultaneous optimizations start one runner', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId } = await seed(ExperimentStatus.computing);
  const manager = createManager();
  const starts = { count: 0 };
  runner(manager, starts);

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
    const manager = createManager();
    const starts = { count: 0 };
    runner(manager, starts);

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
  'after the worker reported and before the container exits, no second optimization or re-run gets in',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.computing);
    const owner = createManager();
    const other = createManager();
    const starts = { count: 0 };
    const refused: string[] = [];
    runner(owner, starts, async () => {
      // The worker has written its result, the container has not exited yet.
      await ExperimentModel.updateOne(
        { _id: experimentId },
        { $set: { 'optimization.status': OptimizationStatus.completed } }
      );
      await other.optimize(experimentId).catch((error: Error) => refused.push(error.message));
      await other
        .enqueueRuns(rerun(experimentId, source) as any)
        .catch((error: Error) => refused.push(error.message));
    });
    runner(other, starts);

    await owner.optimize(experimentId);

    assert.equal(starts.count, 1);
    assert.equal(refused.length, 2);
    assert.match(refused[0], /вже виконується/);
    assert.match(refused[1], /оптимізації/);
    assert.equal(await statusOf(experimentId), ExperimentStatus.completed);
    assert.equal((await runStatuses(experimentId)).count, 1);
  }
);

test(
  'a caller refused while the owner moves to optimization does not undo the owner',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId } = await seed(ExperimentStatus.computing);
    const owner = createManager();
    const other = createManager();
    const starts = { count: 0 };
    runner(owner, starts);
    runner(other, starts);
    const move = owner.experimentManager.changeStatus.bind(owner.experimentManager);
    let entered = false;
    owner.experimentManager.changeStatus = async (input: { status: ExperimentStatus }) => {
      if (input.status === ExperimentStatus.optimization && !entered) {
        entered = true;
        await assert.rejects(() => other.optimize(experimentId), /вже виконується/);
      }
      return move(input);
    };

    await owner.optimize(experimentId);

    assert.equal(entered, true);
    assert.equal(starts.count, 1);
    assert.equal(await statusOf(experimentId), ExperimentStatus.completed);
  }
);

test(
  'a re-run asked for during an optimization is refused and leaves nothing',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.computing);
    const owner = createManager();
    const other = createManager();
    const starts = { count: 0 };
    runner(owner, starts);
    const check = owner.hasUncomputedRun.bind(owner);
    let refusal = '';
    owner.hasUncomputedRun = async (id: Types.ObjectId) => {
      await other
        .enqueueRuns(rerun(experimentId, source) as any)
        .catch((error: Error) => (refusal = error.message));
      return check(id);
    };

    await owner.optimize(experimentId);

    assert.match(refusal, /оптимізації/);
    assert.equal((await runStatuses(experimentId)).count, 1);
    assert.equal(starts.count, 1);
  }
);

test(
  'an optimization asked for during a re-run admission is refused; the re-run is queued',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.completed);
    const admitter = createManager();
    const other = createManager();
    const starts = { count: 0 };
    runner(other, starts);
    const reopen = admitter.experimentManager.changeStatus.bind(admitter.experimentManager);
    let refusal = '';
    admitter.experimentManager.changeStatus = async (input: { status: ExperimentStatus }) => {
      await other.optimize(experimentId).catch((error: Error) => (refusal = error.message));
      return reopen(input);
    };

    await admitter.enqueueRuns(rerun(experimentId, source) as any);

    assert.match(refusal, /перезапуск ставиться в чергу/);
    assert.equal(starts.count, 0);
    assert.deepEqual(await runStatuses(experimentId), {
      count: 2,
      statuses: [PipelineStatus.completed, PipelineStatus.queued],
    });
    assert.equal(await statusOf(experimentId), ExperimentStatus.computing);
    // The queued re-run now keeps any optimization from starting.
    await assert.rejects(() => other.optimize(experimentId), /uncomuted pipelines/);
  }
);

test(
  'a second click waits for the first admission and finds its queued run',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.completed);
    const first = createManager(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    const second = createManager();

    await Promise.all([
      first.enqueueRuns(rerun(experimentId, source) as any),
      new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
        second.enqueueRuns(rerun(experimentId, source) as any)
      ),
    ]);

    assert.deepEqual(await runStatuses(experimentId), {
      count: 2,
      statuses: [PipelineStatus.completed, PipelineStatus.queued],
    });
    assert.equal(await statusOf(experimentId), ExperimentStatus.computing);
  }
);

test(
  'a re-run is queued only after the CSV file is confirmed, for every caller',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.completed);
    // The file passes the first check, then a deletion takes its lease before the re-check.
    let checks = 0;
    const fileCheck = async () => {
      checks += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (checks > 1) throw new Error('Файл експерименту не знайдено або він недоступний.');
    };
    const first = createManager(fileCheck);
    const second = createManager(fileCheck);

    const results = await Promise.allSettled([
      first.enqueueRuns(rerun(experimentId, source) as any),
      new Promise((resolve) => setTimeout(resolve, 20)).then(() =>
        second.enqueueRuns(rerun(experimentId, source) as any)
      ),
    ]);

    // The second caller waited for the first and then failed its own check: nobody queued a run.
    assert.deepEqual(
      results.map((result) => result.status),
      ['rejected', 'rejected']
    );
    assert.deepEqual(await runStatuses(experimentId), {
      count: 1,
      statuses: [PipelineStatus.completed],
    });
    assert.equal(await statusOf(experimentId), ExperimentStatus.completed);
  }
);

test('an interrupted re-run admission stays visible and recoverable', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId, source } = await seed(ExperimentStatus.computing);
  // The admission stopped after creating the run and before its workflow.
  const orphan = await PipelineModel.create({
    experimentId,
    graphStructureId: source.graphStructureId,
    queue: source.queue,
    pathNodeIds: source.pathNodeIds,
    rerunOf: source._id,
  });

  // The run list reads it as idle instead of failing, and gives it its workflow.
  assert.equal(
    await new PipelineResolver().status(orphan.toObject({ getters: true })),
    PipelineStatus.idle
  );
  assert.equal(await WorkflowModel.countDocuments({ instanceId: orphan._id }), 1);
  // A re-run click then reuses and queues it.
  await createManager().enqueueRuns(rerun(experimentId, source) as any);
  assert.deepEqual(await runStatuses(experimentId), {
    count: 2,
    statuses: [PipelineStatus.completed, PipelineStatus.queued],
  });
});

test('a run without a workflow counts as unfinished for the optimization', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId, source } = await seed(ExperimentStatus.computing);
  await PipelineModel.create({
    experimentId,
    graphStructureId: source.graphStructureId,
    queue: source.queue,
    pathNodeIds: source.pathNodeIds,
    rerunOf: source._id,
  });
  const manager = createManager();
  const starts = { count: 0 };
  runner(manager, starts);

  await assert.rejects(() => manager.optimize(experimentId), /uncomuted pipelines/);
  assert.equal(starts.count, 0);
});

test(
  'a manual optimization that found an unfinished run still leads to the automatic one',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.computing);
    const second = await PipelineModel.create({
      experimentId,
      graphStructureId: source.graphStructureId,
      queue: source.queue,
      pathNodeIds: source.pathNodeIds,
      rerunOf: source._id,
    });
    await WorkflowModel.create({
      type: WorkflowType.PIPELINE,
      instanceId: second._id,
      status: PipelineStatus.running,
    });
    const manual = createManager();
    const late = createManager();
    const starts = { count: 0 };
    runner(manual, starts);
    runner(late, starts);
    // The manual call sees the re-run unfinished; before it lets go, the re-run completes and its
    // callback finds the experiment locked and leaves.
    const check = manual.hasUncomputedRun.bind(manual);
    let interleaved = false;
    manual.hasUncomputedRun = async (id: Types.ObjectId) => {
      const unfinished = await check(id);
      if (unfinished && !interleaved) {
        interleaved = true;
        await WorkflowModel.updateOne(
          { instanceId: second._id, type: WorkflowType.PIPELINE },
          { $set: { status: PipelineStatus.completed } }
        );
        await late.reoptimizeAfterRerun(second._id);
        assert.equal(starts.count, 0);
      }
      return unfinished;
    };

    await assert.rejects(() => manual.optimize(experimentId), /uncomuted pipelines/);

    assert.equal(interleaved, true);
    await waitFor(async () => (await statusOf(experimentId)) === ExperimentStatus.completed);
    assert.equal(starts.count, 1);
  }
);

test('a failed attempt keeps its optimization status and can be retried', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId } = await seed(ExperimentStatus.computing);
  const manager = createManager();
  manager.optimizationRunner = {
    run: async () => {
      throw new Error('container failed');
    },
  };

  await assert.rejects(() => manager.optimize(experimentId), /container failed/);

  assert.equal(await statusOf(experimentId), ExperimentStatus.optimization);
  const failed = await ExperimentModel.findById(experimentId).lean();
  assert.equal(failed?.optimization?.status, OptimizationStatus.failed);
  assert.equal(failed?.operationLock, undefined);

  const starts = { count: 0 };
  runner(manager, starts);
  await manager.optimize(experimentId);
  assert.equal(starts.count, 1);
  assert.equal(await statusOf(experimentId), ExperimentStatus.completed);
});

test('a lock left by a dead backend blocks until its lease expires', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId } = await seed(ExperimentStatus.computing);
  const manager = createManager();
  const starts = { count: 0 };
  runner(manager, starts);
  const lockFor = (expiresAt: Date) =>
    ExperimentModel.updateOne(
      { _id: experimentId },
      {
        $set: {
          operationLock: { token: 'dead', operation: ExperimentOperation.optimization, expiresAt },
        },
      }
    );

  await lockFor(new Date(Date.now() + 60_000));
  await assert.rejects(() => manager.optimize(experimentId), /вже виконується/);

  await lockFor(new Date(Date.now() - 1));
  await manager.optimize(experimentId);
  assert.equal(starts.count, 1);
});

test(
  'a repeated click whose running run completes during the admission still gets the optimization',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.computing);
    const running = await PipelineModel.create({
      experimentId,
      graphStructureId: source.graphStructureId,
      queue: source.queue,
      pathNodeIds: source.pathNodeIds,
      rerunOf: source._id,
    });
    await WorkflowModel.create({
      type: WorkflowType.PIPELINE,
      instanceId: running._id,
      status: PipelineStatus.running,
    });
    const admitter = createManager();
    const late = createManager();
    const starts = { count: 0 };
    runner(admitter, starts);
    runner(late, starts);
    // The click reuses the running run; it completes while the admission holds the lock, and its
    // callback finds the lock busy and leaves.
    const reopen = admitter.reopenExperiment.bind(admitter);
    admitter.reopenExperiment = async (id: Types.ObjectId) => {
      await WorkflowModel.updateOne(
        { instanceId: running._id, type: WorkflowType.PIPELINE },
        { $set: { status: PipelineStatus.completed } }
      );
      await late.reoptimizeAfterRerun(running._id);
      assert.equal(starts.count, 0);
      return reopen(id);
    };

    await admitter.enqueueRuns(rerun(experimentId, source) as any);

    await waitFor(async () => (await statusOf(experimentId)) === ExperimentStatus.completed);
    assert.equal(starts.count, 1);
  }
);

// Stop all with the admission and execution the user saw, read back through the run list.
const confirm = async (pipelineId: Types.ObjectId) => {
  const pipeline = (await PipelineModel.findById(pipelineId))!.toObject({ getters: true });
  const resolver = new PipelineResolver();
  return {
    pipelineId: String(pipelineId),
    executionId: pipeline.executionId === undefined ? null : String(pipeline.executionId),
    status: await resolver.status(pipeline),
    admissionId: await resolver.admissionId(pipeline),
  };
};

test(
  'stop all skips a confirmed queued run that was stopped and queued again',
  { skip },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.computing);
    const manager = createManager();
    const pipelines = manager.pipelineManager;
    await WorkflowModel.updateOne(
      { instanceId: source._id },
      { $set: { status: PipelineStatus.idle } }
    );
    await pipelines.changeStatus({ pipelineId: source._id, status: PipelineStatus.queued });
    const seen = await confirm(source._id);
    // Another client stops it and queues it again: same execution, new admission.
    await pipelines.changeStatus({ pipelineId: source._id, status: PipelineStatus.idle });
    await pipelines.changeStatus({ pipelineId: source._id, status: PipelineStatus.queued });

    const stopped = await manager.pauseExperimentRuns(experimentId, undefined, [seen]);

    assert.deepEqual(stopped, []);
    assert.deepEqual((await runStatuses(experimentId)).statuses, [PipelineStatus.queued]);
  }
);

test(
  'stop all still stops a confirmed queued run that a worker took in the same admission',
  {
    skip,
  },
  async (t) => {
    await useDatabase(t);
    const { experimentId, source } = await seed(ExperimentStatus.computing);
    const manager = createManager();
    await WorkflowModel.updateOne(
      { instanceId: source._id },
      { $set: { status: PipelineStatus.idle } }
    );
    await manager.pipelineManager.changeStatus({
      pipelineId: source._id,
      status: PipelineStatus.queued,
    });
    const seen = await confirm(source._id);
    // A worker takes it: a new execution, but the same admission.
    const claimed = await manager.claimNextRun(ComputationQueue.local, { hostname: 'worker-1' });
    assert.equal(String(claimed?._id), String(source._id));

    const stopped = await manager.pauseExperimentRuns(experimentId, undefined, [seen]);

    assert.equal(stopped.length, 1);
    assert.deepEqual((await runStatuses(experimentId)).statuses, [PipelineStatus.idle]);
  }
);

// An admission that stopped after the run and its workflow, before reopening the experiment.
const strandedRerun = async (experimentId: Types.ObjectId, source: any) => {
  const run = await PipelineModel.create({
    experimentId,
    graphStructureId: source.graphStructureId,
    queue: source.queue,
    pathNodeIds: source.pathNodeIds,
    rerunOf: source._id,
  });
  await createManager().pipelineManager.ensureRerunWorkflow(run._id);
  return run;
};

const completeAndCallBack = async (manager: any, runId: Types.ObjectId) => {
  await WorkflowModel.updateOne(
    { instanceId: runId, type: WorkflowType.PIPELINE },
    { $set: { status: PipelineStatus.completed } }
  );
  await manager.reoptimizeAfterRerun(runId);
};

for (const [action, queue] of [
  [
    'Queue all idle',
    async (manager: any, experimentId: Types.ObjectId, runId: Types.ObjectId) =>
      manager.queueRunsByIds(experimentId, ComputationQueue.local, [await confirm(runId)]),
  ],
  [
    'a single queue action',
    async (manager: any, experimentId: Types.ObjectId, runId: Types.ObjectId) =>
      manager.enqueueRuns({
        experimentId: String(experimentId),
        queue: ComputationQueue.local,
        pipelineId: String(runId),
      }),
  ],
  [
    'resume',
    async (manager: any, experimentId: Types.ObjectId) =>
      manager.resumeExperimentRuns(String(experimentId)),
  ],
] as const) {
  test(
    `${action} reopens the experiment of a recovered re-run, so its completion re-optimizes`,
    {
      skip,
    },
    async (t) => {
      await useDatabase(t);
      const { experimentId, source } = await seed(ExperimentStatus.completed);
      const run = await strandedRerun(experimentId, source);
      const manager = createManager();
      const starts = { count: 0 };
      runner(manager, starts);

      await queue(manager, experimentId, run._id);

      assert.equal(await statusOf(experimentId), ExperimentStatus.computing);
      assert.deepEqual((await runStatuses(experimentId)).statuses, [
        PipelineStatus.completed,
        PipelineStatus.queued,
      ]);
      await completeAndCallBack(manager, run._id);
      await waitFor(async () => (await statusOf(experimentId)) === ExperimentStatus.completed);
      assert.equal(starts.count, 1);
    }
  );
}

test('a recovered re-run whose CSV file is gone is not queued', { skip }, async (t) => {
  await useDatabase(t);
  const { experimentId, source } = await seed(ExperimentStatus.completed);
  const run = await strandedRerun(experimentId, source);
  const manager = createManager(async () => {
    throw new Error('Файл експерименту не знайдено або він недоступний.');
  });

  await assert.rejects(
    () =>
      manager.queueRunsByIds(experimentId, ComputationQueue.local, [
        { pipelineId: String(run._id) },
      ]),
    /Файл експерименту/
  );

  assert.equal(await statusOf(experimentId), ExperimentStatus.completed);
  assert.deepEqual((await runStatuses(experimentId)).statuses, [
    PipelineStatus.completed,
    PipelineStatus.idle,
  ]);
});
