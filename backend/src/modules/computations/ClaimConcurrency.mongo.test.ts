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

// Proves atomic claiming against a real MongoDB; model mocks cannot catch a regression in the
// conditional update itself. CI provides the database (see Dockerfile.ci).
const uri = process.env.MONGODB_TEST_URI;
const skip = uri ? false : 'MONGODB_TEST_URI is not set';

// Each test gets its own database and disconnects afterwards, so the stubbed unit tests that
// run in the same process never see a live connection.
const useDatabase = async (t: TestContext) => {
  await mongoose.connect(uri!, { dbName: `claim-test-${process.pid}-${Date.now()}` });
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
