import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import mongoose, { Types } from 'mongoose';

import { PipelineStatus } from '../../core/pipeline/enums';
import { PipelineModel } from '../../core/pipeline/models/PipelineModel';
import { PipelineManager } from '../../core/pipeline/services/PipelineManager';
import { WorkflowType } from '../../core/workflow/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { ComputationManager } from './services/ComputationManager';
import { createLeanResult, stub } from '../../test/testUtils';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../experiments/models/GraphStructureModel';
import { PipelineBaseService } from '../../core/pipeline';
import { CloudComputationWorker } from './services/CloudComputationWorker';
import { PipelineResolver } from '../../core/pipeline/graphql/pipeline';
import { Readable } from 'node:stream';

// Proves atomic claiming against a real MongoDB; model mocks cannot catch a regression in the
// conditional update itself. CI provides the database (see Dockerfile.ci).
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

// Each test gets its own database and disconnects afterwards, so the stubbed unit tests that
// run in the same process never see a live connection.
const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `claim-test-${process.pid}-${Date.now()}` });
  // Mongoose builds indexes once per process; every test database needs its own.
  await WorkflowModel.createIndexes();
  t.after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
};

const seedQueuedRuns = async (count: number, queue: ComputationQueue) => {
  const pipelines = await PipelineModel.create(
    Array.from({ length: count }, () => ({
      experimentId: new Types.ObjectId(),
      graphStructureId: new Types.ObjectId(),
      queue,
      pathNodeIds: [],
    }))
  );
  await WorkflowModel.create(
    pipelines.map((pipeline) => ({
      type: WorkflowType.PIPELINE,
      instanceId: pipeline._id,
      status: PipelineStatus.queued,
    }))
  );
  return pipelines.map((pipeline) => String(pipeline._id));
};

const claimUntilEmpty = async (queue: ComputationQueue) => {
  const manager = new ComputationManager();
  const claimed: string[] = [];
  for (;;) {
    const run = await manager.claimNextRun(queue);
    if (!run) return claimed;
    claimed.push(String(run._id));
  }
};

test('parallel workers take every queued run exactly once', { skip }, async (t) => {
  await useDatabase(t);
  const runIds = await seedQueuedRuns(8, ComputationQueue.cloud);

  const perWorker = await Promise.all(
    Array.from({ length: 6 }, () => claimUntilEmpty(ComputationQueue.cloud))
  );

  const claimed = perWorker.flat();
  assert.deepEqual([...claimed].sort(), [...runIds].sort());
  const workflows = await WorkflowModel.find({ instanceId: { $in: runIds } }).lean();
  assert.equal(workflows.length, runIds.length);
  for (const workflow of workflows) {
    assert.equal(workflow.status, PipelineStatus.running);
    const runningTransitions = workflow.history.filter(
      (item) => item.nextStatus === PipelineStatus.running
    );
    assert.equal(runningTransitions.length, 1);
  }
});

test('local runs are limited per machine, not across machines', { skip }, async (t) => {
  await useDatabase(t);
  const runIds = await seedQueuedRuns(3, ComputationQueue.local);
  const claim = (hostname: string) =>
    new ComputationManager().claimNextRun(ComputationQueue.local, { hostname } as any);

  const [onA, onB] = await Promise.all([claim('host-a'), claim('host-b')]);

  assert.ok(onA && onB);
  assert.notEqual(String(onA._id), String(onB._id));
  // Each machine is now busy with its own run; the third run waits.
  assert.equal(await claim('host-a'), undefined);
  assert.equal(await claim('host-b'), undefined);
  const stillQueued = await WorkflowModel.countDocuments({
    instanceId: { $in: runIds },
    status: PipelineStatus.queued,
  });
  assert.equal(stillQueued, 1);
});

test('parallel workers on one machine take one local run at a time', { skip }, async (t) => {
  await useDatabase(t);
  const runIds = await seedQueuedRuns(4, ComputationQueue.local);
  const claim = () =>
    new ComputationManager().claimNextRun(ComputationQueue.local, { hostname: 'host-a' } as any);
  const finished: string[] = [];

  for (let round = 0; round < runIds.length; round += 1) {
    const claimed = (await Promise.all(Array.from({ length: 6 }, claim))).filter(Boolean);

    assert.equal(claimed.length, 1);
    const running = await WorkflowModel.countDocuments({
      instanceId: { $in: runIds },
      status: PipelineStatus.running,
    });
    assert.equal(running, 1);
    // Finishing the run frees the machine for the next round.
    await new PipelineManager().changeStatus({
      pipelineId: claimed[0]!._id,
      status: PipelineStatus.completed,
    } as any);
    finished.push(String(claimed[0]!._id));
  }

  assert.deepEqual([...finished].sort(), [...runIds].sort());
});

// Holds a call until `open()`; `reached` resolves when the call arrives.
const gate = () => {
  let open!: () => void;
  let arrive!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  const reached = new Promise<void>((resolve) => (arrive = resolve));
  return { open, reached, wait: () => (arrive(), opened) };
};

test('a claimant that resumes after its run was taken claims nothing else', { skip }, async (t) => {
  await useDatabase(t);
  const [first] = await seedQueuedRuns(2, ComputationQueue.local);
  await PipelineModel.updateOne({ _id: first }, { $set: { priority: 1 } });
  const host = { hostname: 'host-a' } as any;

  // Worker A stalls between reading the candidates and its status change.
  const stalled = new ComputationManager();
  const pipelineManager = new PipelineManager();
  const pause = gate();
  let calls = 0;
  stub(t, stalled as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: Parameters<PipelineManager['changeStatus']>) => {
      if ((calls += 1) === 1) await pause.wait();
      return pipelineManager.changeStatus(...args);
    },
  } as any);
  const stalledClaim = stalled.claimNextRun(ComputationQueue.local, host);
  await pause.reached;

  // Worker B on the same machine takes the run A was about to claim.
  const taken = await new ComputationManager().claimNextRun(ComputationQueue.local, host);
  assert.equal(String(taken?._id), first);

  pause.open();
  // A lost its run and must not take the next one while B's run is on the machine.
  assert.equal(await stalledClaim, undefined);
  assert.equal(
    await new ComputationManager().claimNextRun(ComputationQueue.local, host),
    undefined
  );
  assert.equal(await WorkflowModel.countDocuments({ status: PipelineStatus.running }), 1);
});

test('a delayed stop cleanup leaves the run’s next execution alone', { skip }, async (t) => {
  await useDatabase(t);
  const [first] = await seedQueuedRuns(2, ComputationQueue.local);
  await PipelineModel.updateOne({ _id: first }, { $set: { priority: 1 } });
  const claim = (hostname: string) =>
    new ComputationManager().claimNextRun(ComputationQueue.local, { hostname } as any);
  assert.equal(String((await claim('host-a'))?._id), first);

  // The stop's cleanup runs after the workflow is already `idle`; hold it there.
  const cleanup = gate();
  const updateOne = PipelineModel.updateOne.bind(PipelineModel);
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', ((
    filter: any,
    update: any
  ) => {
    if (!('statusMessage' in (update.$unset ?? {}))) return updateOne(filter, update);
    return { exec: async () => (await cleanup.wait(), updateOne(filter, update).exec()) };
  }) as any);
  const stopping = new ComputationManager().stopRun(first!);
  await cleanup.reached;

  // Meanwhile the run is queued again and claimed on another machine.
  await new PipelineManager().changeStatus({
    pipelineId: first,
    status: PipelineStatus.queued,
  } as any);
  // Requeueing resets the priority; keep this run first in line.
  await PipelineModel.updateOne({ _id: first }, { $set: { priority: 1 } });
  assert.equal(String((await claim('host-b'))?._id), first);

  cleanup.open();
  await stopping;
  // host-b is still busy with the run, so the other queued run waits.
  assert.equal(await claim('host-b'), undefined);
  // The old execution's cleanup did not touch the new execution's state.
  assert.equal((await PipelineModel.findById(first).lean())?.machineInfo?.hostname, 'host-b');
  assert.equal(await WorkflowModel.countDocuments({ status: PipelineStatus.running }), 1);
});

test('the workflows index allows one running run per machine hostname', { skip }, async (t) => {
  await useDatabase(t);
  const workflow = (status: PipelineStatus, machineHostname?: string) =>
    WorkflowModel.create({
      type: WorkflowType.PIPELINE,
      instanceId: new Types.ObjectId(),
      status,
      machineHostname,
    });
  const duplicateKey = { code: 11000 };

  const running = await workflow(PipelineStatus.running, 'host-a');
  await assert.rejects(() => workflow(PipelineStatus.running, 'host-a'), duplicateKey);
  // Other hosts, other statuses and runs without a hostname are not limited.
  await workflow(PipelineStatus.running, 'host-b');
  await workflow(PipelineStatus.idle, 'host-a');
  await workflow(PipelineStatus.running);
  await workflow(PipelineStatus.running);

  // Leaving `running` takes the run out of the index in the same update.
  await WorkflowModel.updateOne({ _id: running._id }, { $set: { status: PipelineStatus.idle } });
  await workflow(PipelineStatus.running, 'host-a');
});

const result = (accuracy: number) => ({
  accuracyScores: [accuracy],
  f1Scores: [accuracy],
  rocAucScores: [accuracy],
  sampleCount: 1,
  duration: 1,
  channelNames: ['C3'],
});

// Stops the run's current execution, queues it again and claims it on `hostname`.
const startNextExecution = async (
  pipelineId: string,
  queue: ComputationQueue,
  hostname: string
) => {
  await new ComputationManager().stopRun(pipelineId);
  await new PipelineManager().changeStatus({ pipelineId, status: PipelineStatus.queued } as any);
  return new ComputationManager().claimNextRun(queue, { hostname } as any);
};

test('reports from an older execution leave the newer execution alone', { skip }, async (t) => {
  await useDatabase(t);
  const [runId] = await seedQueuedRuns(1, ComputationQueue.local);
  const manager = new ComputationManager();
  const progress = (executionId: number, value: number) =>
    PipelineBaseService.updatePipelineProgress({
      pipelineId: runId,
      executionId: String(executionId),
      progress: value,
    } as any);
  const state = async () => ({
    status: (await WorkflowModel.findOne({ instanceId: runId }).lean())?.status,
    pipeline: await PipelineModel.findById(runId).lean(),
  });

  const old = await manager.claimNextRun(ComputationQueue.local, { hostname: 'host-a' } as any);
  assert.equal(old?.executionId, 1);
  const fresh = await startNextExecution(runId!, ComputationQueue.local, 'host-b');
  assert.equal(fresh?.executionId, 2);

  // The old execution's delayed progress, completion and failure all arrive now.
  await progress(1, 77);
  assert.equal(
    await manager.completePipeline({
      pipelineId: runId!,
      executionId: '1',
      payload: result(0.1),
    } as any),
    false
  );
  await manager.failRun({ runId: runId!, executionId: '1', statusMessage: 'old failure' });

  let current = await state();
  assert.equal(current.status, PipelineStatus.running);
  assert.equal(current.pipeline?.progress, 0);
  assert.equal(current.pipeline?.computingResult, undefined);
  assert.equal(current.pipeline?.machineInfo?.hostname, 'host-b');

  // The new execution's own reports are applied.
  await progress(2, 40);
  assert.equal((await state()).pipeline?.progress, 40);
  assert.equal(
    await manager.completePipeline({
      pipelineId: runId!,
      executionId: '2',
      payload: result(0.9),
    } as any),
    true
  );

  // A repeated completion succeeds without overwriting; a late failure changes nothing.
  assert.equal(
    await manager.completePipeline({
      pipelineId: runId!,
      executionId: '2',
      payload: result(0.5),
    } as any),
    true
  );
  await manager.failRun({ runId: runId!, executionId: '2', statusMessage: 'late failure' });
  current = await state();
  assert.equal(current.status, PipelineStatus.completed);
  assert.deepEqual(current.pipeline?.computingResult?.accuracyScores, [0.9]);
});

test(
  'a completion and a failure of one execution racing: exactly one applies',
  { skip },
  async (t) => {
    await useDatabase(t);
    for (let round = 0; round < 10; round += 1) {
      const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
      const manager = new ComputationManager();
      const run = await manager.claimNextRun(ComputationQueue.cloud);
      assert.equal(String(run?._id), runId);
      const executionId = String(run?.executionId);

      const [completed] = await Promise.all([
        manager.completePipeline({ pipelineId: runId!, executionId, payload: result(0.7) } as any),
        manager.failRun({ runId: runId!, executionId, statusMessage: 'failed' }),
      ]);

      const workflow = await WorkflowModel.findOne({ instanceId: runId }).lean();
      const pipeline = await PipelineModel.findById(runId).lean();
      assert.equal(workflow?.status, completed ? PipelineStatus.completed : PipelineStatus.idle);
      // A result is stored only when the completion won.
      assert.equal(Boolean(pipeline?.computingResult), completed);
    }
  }
);

test('reports without a valid executionId are rejected', { skip }, async (t) => {
  await useDatabase(t);
  const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
  const manager = new ComputationManager();
  await manager.claimNextRun(ComputationQueue.cloud);
  const status = async () => (await WorkflowModel.findOne({ instanceId: runId }).lean())?.status;

  for (const executionId of [undefined, null, '', '0', 'abc']) {
    await assert.rejects(
      () =>
        manager.completePipeline({ pipelineId: runId!, executionId, payload: result(0.3) } as any),
      /executionId/
    );
    await assert.rejects(
      () => manager.failRun({ runId: runId!, executionId } as any),
      /executionId/
    );
    await assert.rejects(
      () =>
        PipelineBaseService.updatePipelineProgress({
          pipelineId: runId,
          executionId,
          progress: 5,
        } as any),
      /executionId/
    );
  }

  assert.equal(await status(), PipelineStatus.running);
  const pipeline = await PipelineModel.findById(runId).lean();
  assert.equal(pipeline?.computingResult, undefined);
  assert.equal(pipeline?.progress, 0);
});

test(
  'a result left by an older execution in S3 does not complete a newer one',
  { skip },
  async (t) => {
    await useDatabase(t);
    const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
    const old = await new ComputationManager().claimNextRun(ComputationQueue.cloud);
    assert.equal(old?.executionId, 1);
    const fresh = await startNextExecution(runId!, ComputationQueue.cloud, 'host-b');
    assert.equal(fresh?.executionId, 2);

    // Simulated S3 (real MongoDB): the old execution's result under its own key.
    const stored: Record<string, unknown> = {
      [`prefix/${runId}/1.json`]: { status: 'completed', result: result(0.1) },
    };
    const worker = new CloudComputationWorker() as any;
    worker.resultsPrefix = 'prefix';
    stub(t, worker, 's3', {
      send: async (command: any) => {
        const body = stored[command.input.Key];
        if (!body) throw { name: 'NoSuchKey' };
        return { Body: Readable.from([JSON.stringify(body)]) };
      },
    });
    const status = async () => (await WorkflowModel.findOne({ instanceId: runId }).lean())?.status;

    await worker.reconcileRuns();
    assert.equal(await status(), PipelineStatus.running);

    // A result under the new key that names another execution is ignored too.
    stored[`prefix/${runId}/2.json`] = {
      executionId: '1',
      status: 'completed',
      result: result(0.2),
    };
    await worker.reconcileRuns();
    assert.equal(await status(), PipelineStatus.running);

    stored[`prefix/${runId}/2.json`] = {
      executionId: '2',
      status: 'completed',
      result: result(0.8),
    };
    await worker.reconcileRuns();
    assert.equal(await status(), PipelineStatus.completed);
    assert.deepEqual(
      (await PipelineModel.findById(runId).lean())?.computingResult?.accuracyScores,
      [0.8]
    );
  }
);

test(
  'changePipelineStatus(idle) sent for an earlier execution leaves the newer one alone',
  { skip },
  async (t) => {
    await useDatabase(t);
    const [runId] = await seedQueuedRuns(1, ComputationQueue.local);
    const resolver = new PipelineResolver();
    const changeStatus = (status: PipelineStatus, message?: string) =>
      resolver.changePipelineStatus({ pipelineId: runId, status, message } as any);
    const state = async () => ({
      workflow: await WorkflowModel.findOne({ instanceId: runId }).lean(),
      pipeline: await PipelineModel.findById(runId).lean(),
    });

    // Execution A is stopped and the run starts again as B.
    await new ComputationManager().claimNextRun(ComputationQueue.local, {
      hostname: 'host-a',
    } as any);
    const fresh = await startNextExecution(runId!, ComputationQueue.local, 'host-b');
    assert.equal(fresh?.executionId, 2);
    await PipelineBaseService.updatePipelineProgress({
      pipelineId: runId,
      executionId: '2',
      progress: 30,
    } as any);

    // A request without execution identity, meant for A, arrives now.
    await assert.rejects(
      () => changeStatus(PipelineStatus.idle, 'A failed'),
      /TRANSITION_NOT_FOUND/
    );
    const current = await state();
    assert.equal(current.workflow?.status, PipelineStatus.running);
    assert.equal(current.workflow?.executionId, 2);
    assert.equal(current.pipeline?.machineInfo?.hostname, 'host-b');
    assert.equal(current.pipeline?.progress, 30);

    // The user's Stop (stopExperimentRun) still ends the running execution.
    await new ComputationManager().stopRun(runId!);
    assert.equal((await state()).workflow?.status, PipelineStatus.idle);
    // Queueing and taking a run out of the queue still work through the mutation.
    assert.equal(await changeStatus(PipelineStatus.queued), true);
    assert.equal(await changeStatus(PipelineStatus.idle), true);
    assert.equal((await state()).workflow?.status, PipelineStatus.idle);
  }
);

// A manager whose AWS cancellations are recorded instead of sent.
const managerWithCancelLog = (t: TestContext) => {
  const manager = new ComputationManager();
  const cancelled: string[] = [];
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'cancelCloudJob',
    async (jobId: string) => {
      cancelled.push(jobId);
    }
  );
  return { manager, cancelled };
};
const statusOf = async (runId: string) =>
  (await WorkflowModel.findOne({ instanceId: runId }).lean())?.status;
const recordJob = (runId: string, executionId: number, cloudJobId: string) =>
  PipelineModel.updateOne({ _id: runId, executionId }, { $set: { cloudJobId } });

test(
  'Stop ends a local run, frees its machine and silences the stopped execution',
  { skip },
  async (t) => {
    await useDatabase(t);
    const [first, second] = await seedQueuedRuns(2, ComputationQueue.local);
    await PipelineModel.updateOne({ _id: first }, { $set: { priority: 1 } });
    const claim = () =>
      new ComputationManager().claimNextRun(ComputationQueue.local, { hostname: 'host-a' } as any);
    const { manager, cancelled } = managerWithCancelLog(t);

    assert.equal(String((await claim())?._id), first);
    assert.equal(await claim(), undefined);

    await manager.stopRun(first!);
    assert.equal(await statusOf(first!), PipelineStatus.idle);
    assert.deepEqual(cancelled, []);
    // The machine is free again, and the stopped execution's late completion is ignored.
    assert.equal(String((await claim())?._id), second);
    assert.equal(
      await manager.completePipeline({
        pipelineId: first!,
        executionId: '1',
        payload: result(0.4),
      } as any),
      false
    );
    assert.equal(await statusOf(first!), PipelineStatus.idle);
  }
);

test('Stop cancels the AWS job of the execution it stops', { skip }, async (t) => {
  await useDatabase(t);
  const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
  const { manager, cancelled } = managerWithCancelLog(t);
  await manager.claimNextRun(ComputationQueue.cloud);
  await recordJob(runId!, 1, 'job-1');

  await manager.stopRun(runId!);

  assert.equal(await statusOf(runId!), PipelineStatus.idle);
  assert.deepEqual(cancelled, ['job-1']);
});

test('Stop leaves idle and finished runs alone', { skip }, async (t) => {
  await useDatabase(t);
  const [idleRun, finishedRun] = await seedQueuedRuns(2, ComputationQueue.cloud);
  const { manager, cancelled } = managerWithCancelLog(t);
  await new PipelineManager().changeStatus({
    pipelineId: idleRun,
    status: PipelineStatus.idle,
  } as any);
  const run = await manager.claimNextRun(ComputationQueue.cloud);
  assert.equal(String(run?._id), finishedRun);
  await recordJob(finishedRun!, 1, 'job-done');
  await manager.completePipeline({
    pipelineId: finishedRun!,
    executionId: '1',
    payload: result(0.6),
  } as any);

  await manager.stopRun(idleRun!);
  await manager.stopRun(finishedRun!);

  assert.equal(await statusOf(idleRun!), PipelineStatus.idle);
  assert.equal(await statusOf(finishedRun!), PipelineStatus.completed);
  assert.deepEqual(cancelled, []);
});

test(
  'Stop racing a completion fails neither and always cancels a stopped job',
  { skip },
  async (t) => {
    await useDatabase(t);
    for (let round = 0; round < 10; round += 1) {
      const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
      const { manager, cancelled } = managerWithCancelLog(t);
      const run = await manager.claimNextRun(ComputationQueue.cloud);
      const executionId = String(run?.executionId);
      await recordJob(runId!, run!.executionId!, `job-${round}`);

      await Promise.all([
        manager.stopRun(runId!),
        manager.completePipeline({ pipelineId: runId!, executionId, payload: result(0.5) } as any),
      ]);

      const status = await statusOf(runId!);
      assert.ok(status === PipelineStatus.idle || status === PipelineStatus.completed);
      // If the completion won, Stop may still have cancelled the finished job, which is harmless.
      if (status === PipelineStatus.idle) assert.deepEqual(cancelled, [`job-${round}`]);
      else assert.ok(cancelled.every((jobId) => jobId === `job-${round}`));
    }
  }
);

test(
  'a job recorded after its execution was stopped is cancelled by the submitter',
  { skip },
  async (t) => {
    await useDatabase(t);
    const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
    const worker = new CloudComputationWorker() as any;
    const cancelled: string[] = [];
    stub(t, worker.manager, 'cancelCloudJob', async (jobId: string) => {
      cancelled.push(jobId);
    });
    stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
      createLeanResult({ _id: new Types.ObjectId() })
    );
    stub(t, GraphStructureModel as unknown as Record<string, unknown>, 'findOne', () =>
      createLeanResult({
        nodes: [{ _id: new Types.ObjectId(), stage: 'CLASSIFICATION', settings: [] }],
      })
    );
    const run = await worker.manager.claimNextRun(ComputationQueue.cloud);

    // The user stops the run while AWS is accepting the job, before its id is recorded.
    stub(t, worker, 'batch', {
      send: async () => {
        await new ComputationManager().stopRun(runId!);
        return { jobId: 'job-late' };
      },
    });
    await worker.submitRun(runId, run.executionId);

    assert.equal(await statusOf(runId!), PipelineStatus.idle);
    assert.deepEqual(cancelled, ['job-late']);
  }
);

test('a late failure report does not take a requeued run out of the queue', { skip }, async (t) => {
  await useDatabase(t);
  const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
  const { manager } = managerWithCancelLog(t);
  await manager.claimNextRun(ComputationQueue.cloud);
  await manager.stopRun(runId!);
  await new PipelineManager().changeStatus({
    pipelineId: runId,
    status: PipelineStatus.queued,
  } as any);

  // Execution 1's failure arrives while the retry waits in the queue, still under executionId 1.
  await manager.failRun({ runId: runId!, executionId: '1', statusMessage: 'late failure' });

  assert.equal(await statusOf(runId!), PipelineStatus.queued);
  const retry = await manager.claimNextRun(ComputationQueue.cloud);
  assert.equal(retry?.executionId, 2);
  assert.equal(await statusOf(runId!), PipelineStatus.running);
});

// Between the stop's status change and the rest of the stop, the run is queued again and claimed
// by execution 2, which clears the pipeline's cloudJobId and raises its execution fence.
const requeueAndReclaimAfterStop = (t: TestContext, manager: ComputationManager, runId: string) => {
  const pipelineManager = new PipelineManager();
  let done = false;
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: Parameters<PipelineManager['changeStatus']>) => {
      const changed = await pipelineManager.changeStatus(...args);
      if (!done && args[0].status === PipelineStatus.idle) {
        done = true;
        await pipelineManager.changeStatus({
          pipelineId: runId,
          status: PipelineStatus.queued,
        } as any);
        const pipeline = await PipelineModel.findById(runId).lean();
        assert.equal(pipeline?.cloudJobId, undefined, 'the requeue cleared execution 1 job id');
        await new ComputationManager().claimNextRun(ComputationQueue.cloud);
        await recordJob(runId, 2, 'job-2');
      }
      return changed;
    },
  } as any);
};

for (const action of ['Stop', 'Pause'] as const) {
  test(
    `${action} cancels the stopped job although the run is requeued and reclaimed meanwhile`,
    { skip },
    async (t) => {
      await useDatabase(t);
      const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
      const { manager, cancelled } = managerWithCancelLog(t);
      await manager.claimNextRun(ComputationQueue.cloud);
      await recordJob(runId!, 1, 'job-1');
      requeueAndReclaimAfterStop(t, manager, runId!);

      if (action === 'Stop') await manager.stopRun(runId!);
      else
        await manager.pauseExperimentRuns(
          (await PipelineModel.findById(runId).lean())!.experimentId
        );

      assert.deepEqual(cancelled, ['job-1']);
      // Execution 2 keeps running with its own job; only execution 1's job was cancelled.
      const workflow = await WorkflowModel.findOne({ instanceId: runId }).lean();
      assert.equal(workflow?.status, PipelineStatus.running);
      assert.equal(workflow?.executionId, 2);
      assert.equal((await PipelineModel.findById(runId).lean())?.cloudJobId, 'job-2');
    }
  );
}

test(
  'a submission and a Stop racing: a submitted job is cancelled exactly once',
  { skip },
  async (t) => {
    await useDatabase(t);
    stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
      createLeanResult({ _id: new Types.ObjectId() })
    );
    stub(t, GraphStructureModel as unknown as Record<string, unknown>, 'findOne', () =>
      createLeanResult({
        nodes: [{ _id: new Types.ObjectId(), stage: 'CLASSIFICATION', settings: [] }],
      })
    );
    for (let round = 0; round < 20; round += 1) {
      const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
      const cancelled: string[] = [];
      const submitted: string[] = [];
      const worker = new CloudComputationWorker() as any;
      const { manager: stopper, cancelled: stopperCancelled } = managerWithCancelLog(t);
      stub(t, worker.manager, 'cancelCloudJob', async (jobId: string) => {
        cancelled.push(jobId);
      });
      stub(t, worker, 'batch', {
        send: async () => {
          submitted.push(`job-${round}`);
          return { jobId: `job-${round}` };
        },
      });
      const run = await worker.manager.claimNextRun(ComputationQueue.cloud);

      // submitRun checks that the execution runs, submits and records the job; Stop marks the
      // execution, ends it and cancels the job it found. Their steps interleave freely here.
      await Promise.all([worker.submitRun(runId, run.executionId), stopper.stopRun(runId!)]);

      assert.equal(await statusOf(runId!), PipelineStatus.idle);
      // Either nothing was submitted (Stop ended the run before the check), or the job is cancelled
      // by exactly one side: by Stop if it was recorded first, otherwise by the submitter.
      assert.deepEqual([...cancelled, ...stopperCancelled], submitted);
    }
  }
);

test(
  'a failed result write leaves the run running and a valid retry completes it',
  { skip },
  async (t) => {
    await useDatabase(t);
    const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
    const manager = new ComputationManager();
    await manager.claimNextRun(ComputationQueue.cloud);

    // The value cannot be cast to the result schema, so MongoDB is never written.
    await assert.rejects(
      () =>
        manager.completeRun({
          runId: runId!,
          executionId: 1,
          resultJson: JSON.stringify({ ...result(0.5), accuracyScores: ['not a number'] }),
        }),
      /Cast/
    );
    assert.equal(await statusOf(runId!), PipelineStatus.running);
    assert.equal((await PipelineModel.findById(runId).lean())?.computingResult, undefined);

    assert.equal(
      await manager.completePipeline({
        pipelineId: runId!,
        executionId: '1',
        payload: result(0.5),
      } as any),
      true
    );
    assert.equal(await statusOf(runId!), PipelineStatus.completed);
    assert.deepEqual(
      (await PipelineModel.findById(runId).lean())?.computingResult?.accuracyScores,
      [0.5]
    );
  }
);

test('a report interrupted after saving the result can be repeated', { skip }, async (t) => {
  await useDatabase(t);
  const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
  const manager = new ComputationManager();
  await manager.claimNextRun(ComputationQueue.cloud);
  const report = () =>
    manager.completePipeline({ pipelineId: runId!, executionId: '1', payload: result(0.7) } as any);

  // The process dies, or the database goes away, between the two writes.
  const pipelineManager = new PipelineManager();
  let interrupted = false;
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    endExecution: async (...args: Parameters<PipelineManager['endExecution']>) => {
      if (!interrupted) {
        interrupted = true;
        throw new Error('connection lost');
      }
      return pipelineManager.endExecution(...args);
    },
  } as any);

  await assert.rejects(report, /connection lost/);
  assert.equal(await statusOf(runId!), PipelineStatus.running);

  assert.equal(await report(), true);
  assert.equal(await statusOf(runId!), PipelineStatus.completed);
  assert.deepEqual(
    (await PipelineModel.findById(runId).lean())?.computingResult?.accuracyScores,
    [0.7]
  );
});

test(
  'only the execution that completed a run can repair its missing result',
  { skip },
  async (t) => {
    await useDatabase(t);
    const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
    const manager = new ComputationManager();
    await manager.claimNextRun(ComputationQueue.cloud);
    await startNextExecution(runId!, ComputationQueue.cloud, 'host-b');
    // Execution 2 is completed with no result on the pipeline.
    await new PipelineManager().endExecution(
      { pipelineId: runId, status: PipelineStatus.completed } as any,
      { executionId: 2 }
    );
    const report = (executionId: string, accuracy: number) =>
      manager.completePipeline({
        pipelineId: runId!,
        executionId,
        payload: result(accuracy),
      } as any);
    const stored = async () =>
      (await PipelineModel.findById(runId).lean())?.computingResult?.accuracyScores;

    assert.equal(await report('1', 0.1), false);
    assert.equal(await stored(), undefined);

    assert.equal(await report('2', 0.9), true);
    assert.deepEqual(await stored(), [0.9]);

    assert.equal(await report('2', 0.2), true);
    assert.equal(await report('1', 0.1), false);
    assert.deepEqual(await stored(), [0.9]);
    assert.equal(await statusOf(runId!), PipelineStatus.completed);
  }
);

test(
  'a result that lost to a Stop does not stay on the run or reach its retry',
  { skip },
  async (t) => {
    await useDatabase(t);
    const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
    const manager = new ComputationManager();
    await manager.claimNextRun(ComputationQueue.cloud);
    await manager.stopRun(runId!);
    await new PipelineManager().changeStatus({
      pipelineId: runId,
      status: PipelineStatus.queued,
    } as any);
    const report = (executionId: string, accuracy: number) =>
      manager.completePipeline({
        pipelineId: runId!,
        executionId,
        payload: result(accuracy),
      } as any);
    const stored = async () => (await PipelineModel.findById(runId).lean())?.computingResult;

    // Execution 1 reports while the retry waits in the queue, still under its number.
    assert.equal(await report('1', 0.1), false);
    assert.equal(await statusOf(runId!), PipelineStatus.queued);
    assert.equal(await stored(), undefined);

    // A process that died mid-report could leave a result behind; the claim drops it.
    await PipelineModel.updateOne({ _id: runId }, { $set: { computingResult: result(0.2) } });
    const retry = await manager.claimNextRun(ComputationQueue.cloud);
    assert.equal(retry?.executionId, 2);
    assert.equal(await stored(), undefined);

    assert.equal(await report('2', 0.8), true);
    assert.deepEqual((await stored())?.accuracyScores, [0.8]);
  }
);

test('repeated reports of one execution racing: one result, all accepted', { skip }, async (t) => {
  await useDatabase(t);
  for (let round = 0; round < 10; round += 1) {
    const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
    const manager = new ComputationManager();
    await manager.claimNextRun(ComputationQueue.cloud);
    const accuracies = [0.1, 0.2, 0.3, 0.4];

    const accepted = await Promise.all(
      accuracies.map((accuracy) =>
        manager.completePipeline({
          pipelineId: runId!,
          executionId: '1',
          payload: result(accuracy),
        } as any)
      )
    );

    assert.deepEqual(accepted, [true, true, true, true]);
    assert.equal(await statusOf(runId!), PipelineStatus.completed);
    const stored = (await PipelineModel.findById(runId).lean())?.computingResult?.accuracyScores;
    assert.ok(accuracies.includes(stored?.[0] as number));
  }
});

test(
  'cloud reconciliation recovers after an unreadable result is replaced',
  { skip },
  async (t) => {
    await useDatabase(t);
    const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
    const worker = new CloudComputationWorker() as any;
    worker.resultsPrefix = 'prefix';
    await worker.manager.claimNextRun(ComputationQueue.cloud);
    let body: unknown = {
      status: 'completed',
      result: { ...result(0.4), accuracyScores: ['not a number'] },
    };
    stub(t, worker, 's3', {
      send: async () => ({ Body: Readable.from([JSON.stringify(body)]) }),
    });

    await assert.rejects(() => worker.reconcileRuns(), /Cast/);
    assert.equal(await statusOf(runId!), PipelineStatus.running);

    // Reconciliation reads running runs only, so the run must still be there to pick up.
    body = { status: 'completed', result: result(0.4) };
    await worker.reconcileRuns();
    assert.equal(await statusOf(runId!), PipelineStatus.completed);
    assert.deepEqual(
      (await PipelineModel.findById(runId).lean())?.computingResult?.accuracyScores,
      [0.4]
    );
  }
);

// Fails the first write that matches, and passes every other one to the real model.
const failPipelineWriteOnce = (t: TestContext, matches: (update: any) => boolean) => {
  const updateOne = PipelineModel.updateOne.bind(PipelineModel);
  const state = { failed: false };
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', ((
    filter: any,
    update: any
  ) => {
    if (state.failed || !matches(update)) return updateOne(filter, update);
    state.failed = true;
    return { exec: async () => Promise.reject(new Error('write failed')) };
  }) as any);
  return state;
};

// A cloud run with a recorded job, and the user action that ends it.
const runningCloudRun = async (t: TestContext, action: 'Stop' | 'Pause') => {
  const [runId] = await seedQueuedRuns(1, ComputationQueue.cloud);
  const { manager, cancelled } = managerWithCancelLog(t);
  await manager.claimNextRun(ComputationQueue.cloud);
  await recordJob(runId!, 1, 'job-1');
  const { experimentId } = (await PipelineModel.findById(runId).lean())!;
  const end = () =>
    action === 'Stop' ? manager.stopRun(runId!) : manager.pauseExperimentRuns(experimentId);
  return { runId: runId!, cancelled, end };
};

for (const action of ['Stop', 'Pause'] as const) {
  // Both writes come after the workflow is already `idle`.
  for (const [write, matches] of [
    ['cleanup', (update: any) => 'statusMessage' in (update.$unset ?? {})],
    ['history', (update: any) => Boolean(update.$push?.history)],
  ] as const) {
    test(
      `${action} cancels the AWS job when the ${write} write after the status change fails`,
      { skip },
      async (t) => {
        await useDatabase(t);
        const { runId, cancelled, end } = await runningCloudRun(t, action);
        const injected = failPipelineWriteOnce(t, matches);

        await assert.rejects(end, /write failed/);

        assert.equal(injected.failed, true);
        assert.equal(await statusOf(runId), PipelineStatus.idle);
        assert.deepEqual(cancelled, ['job-1']);

        // Repeating it finds nothing left to stop, and the job has already been cancelled.
        await end();
        assert.deepEqual(cancelled, ['job-1']);
      }
    );
  }

  test(`${action} can be repeated when the status change itself fails`, { skip }, async (t) => {
    await useDatabase(t);
    const { runId, cancelled, end } = await runningCloudRun(t, action);
    const updateOne = WorkflowModel.updateOne.bind(WorkflowModel);
    let failed = false;
    stub(t, WorkflowModel as unknown as Record<string, unknown>, 'updateOne', ((
      filter: any,
      update: any
    ) => {
      if (failed) return updateOne(filter, update);
      failed = true;
      return Promise.reject(new Error('status write failed'));
    }) as any);

    await assert.rejects(end, /status write failed/);
    assert.equal(await statusOf(runId), PipelineStatus.running);
    assert.deepEqual(cancelled, ['job-1']);

    await end();
    assert.equal(await statusOf(runId), PipelineStatus.idle);
    assert.ok(cancelled.every((jobId) => jobId === 'job-1'));
  });
}
