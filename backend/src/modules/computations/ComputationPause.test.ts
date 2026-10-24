import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Types } from 'mongoose';

import { PipelineModel } from '../../core/pipeline/models/PipelineModel';
import { PipelineStatus } from '../../core/pipeline/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { createLeanResult, stub } from '../../test/testUtils';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { ComputationManager } from './services/ComputationManager';

type FakeRun = {
  _id: Types.ObjectId;
  experimentId: Types.ObjectId;
  queue: ComputationQueue;
  status: PipelineStatus;
  cloudJobId?: string;
};

const createRun = (overrides: Partial<FakeRun> = {}): FakeRun => ({
  _id: new Types.ObjectId(),
  experimentId: new Types.ObjectId(),
  queue: ComputationQueue.local,
  status: PipelineStatus.queued,
  ...overrides,
});

// Every model call yields to the event loop, so concurrent callers interleave between their
// reads and writes the way they would against MongoDB.
const tick = () => new Promise((resolve) => setImmediate(resolve));
const matches = (doc: any, query: Record<string, any>) =>
  Object.entries(query).every(([path, condition]) => {
    const value = path.split('.').reduce((current, key) => current?.[key], doc);
    if (condition && typeof condition === 'object' && '$in' in condition) {
      return condition.$in.some((item: unknown) => String(item) === String(value));
    }
    return String(value) === String(condition);
  });

// In-memory pipelines and their workflows (one workflow per run, sharing its _id). The real
// ComputationManager, PipelineManager and WorkflowManager run on top of it.
const installStore = (t: TestContext, runs: FakeRun[]) => {
  const byId = (id: unknown) => runs.find((run) => String(run._id) === String(id));

  stub(
    t,
    WorkflowModel as unknown as Record<string, unknown>,
    'aggregate',
    async (stages: any[]) => {
      await tick();
      let docs: any[] = runs.map((run) => ({
        type: 'PIPELINE',
        status: run.status,
        instanceId: run._id,
        pipeline: { ...run },
      }));
      for (const stage of stages) {
        if (stage.$match) docs = docs.filter((doc) => matches(doc, stage.$match));
        if (stage.$replaceRoot) docs = docs.map((doc) => doc.pipeline);
        if (stage.$limit) docs = docs.slice(0, stage.$limit);
      }
      return docs;
    }
  );
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', (query: any) => ({
    sort: () => ({
      lean: async () => {
        await tick();
        const run = byId(query.instanceId);
        return run ? { _id: run._id, status: run.status } : null;
      },
    }),
  }));
  stub(
    t,
    WorkflowModel as unknown as Record<string, unknown>,
    'updateOne',
    async (filter: any, update: any) => {
      await tick();
      const run = byId(filter._id);
      if (!run || (filter.status !== undefined && run.status !== filter.status)) {
        return { modifiedCount: 0 };
      }
      run.status = update.$set.status;
      return { modifiedCount: 1 };
    }
  );
  stub(
    t,
    PipelineModel as unknown as Record<string, unknown>,
    'updateOne',
    (filter: any, update: any) => {
      const run = byId(filter._id);
      if (run && update.$unset && 'cloudJobId' in update.$unset) delete run.cloudJobId;
      return { exec: async () => ({}) };
    }
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'find', (query: any) => ({
    lean: async () => runs.filter((run) => matches(run, { _id: query._id })),
  }));
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(null)
  );
};

const managerWithCancelLog = (t: TestContext) => {
  const manager = new ComputationManager();
  const cancelledJobs: string[] = [];
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'cancelCloudJob',
    async (jobId: string) => {
      cancelledJobs.push(jobId);
    }
  );
  return { manager, cancelledJobs };
};

test('pausing moves queued and running runs to idle and cancels cloud jobs', async (t) => {
  const experimentId = new Types.ObjectId();
  const queued = createRun({ experimentId });
  const running = createRun({
    experimentId,
    queue: ComputationQueue.cloud,
    status: PipelineStatus.running,
    cloudJobId: 'job-1',
  });
  const otherExperiment = createRun();
  installStore(t, [queued, running, otherExperiment]);
  const { manager, cancelledJobs } = managerWithCancelLog(t);

  const paused = await manager.pauseExperimentRuns(experimentId);

  assert.equal(paused.length, 2);
  assert.equal(queued.status, PipelineStatus.idle);
  assert.equal(running.status, PipelineStatus.idle);
  assert.deepEqual(cancelledJobs, ['job-1']);
  assert.equal(otherExperiment.status, PipelineStatus.queued);
  // The paused queued run is no longer claimable; the other experiment's run still is.
  const claimed = await new ComputationManager().claimNextRun(ComputationQueue.local);
  assert.equal(String(claimed?._id), String(otherExperiment._id));
  assert.equal(queued.status, PipelineStatus.idle);
});

test('resuming re-queues the paused runs so workers can claim them again', async (t) => {
  const experimentId = new Types.ObjectId();
  const first = createRun({ experimentId });
  const second = createRun({ experimentId, status: PipelineStatus.running });
  installStore(t, [first, second]);
  const { manager } = managerWithCancelLog(t);

  await manager.pauseExperimentRuns(experimentId);
  assert.equal(await new ComputationManager().claimNextRun(ComputationQueue.local), undefined);

  const resumed = await manager.resumeExperimentRuns(experimentId.toHexString());

  assert.equal(resumed.length, 2);
  assert.equal(first.status, PipelineStatus.queued);
  assert.equal(second.status, PipelineStatus.queued);
  const claimed = await new ComputationManager().claimNextRun(ComputationQueue.local);
  assert.ok(claimed);
  assert.equal([first, second].filter((run) => run.status === PipelineStatus.running).length, 1);
});

for (const order of ['pause first', 'claim first'] as const) {
  test(`a pause racing a claim leaves the run idle (${order})`, async (t) => {
    const run = createRun();
    installStore(t, [run]);
    const pause = () => managerWithCancelLog(t).manager.pauseExperimentRuns(run.experimentId);
    const claim = () => new ComputationManager().claimNextRun(ComputationQueue.local);

    await Promise.all(order === 'pause first' ? [pause(), claim()] : [claim(), pause()]);

    // Either the claim lost, or it won and the pause then stopped the run; the worker's
    // status watcher aborts a run that is no longer `running`.
    assert.equal(run.status, PipelineStatus.idle);
  });
}
