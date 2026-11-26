import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Types } from 'mongoose';

import { PipelineModel } from '../../core/pipeline/models/PipelineModel';
import { PipelineStatus } from '../../core/pipeline/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { stub } from '../../test/testUtils';
import { ExperimentStatus } from '../experiments/classes/ExperimentStatus';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { ComputationManager } from './services/ComputationManager';

type RunSeed = {
  _id: Types.ObjectId;
  /** `undefined` is a run that has no workflow (an interrupted admission). */
  status?: PipelineStatus;
  createdAt?: Date;
};

// `prepareRerun` runs under the experiment lock (see `admitRerun`), so it is tested on its own.
const setup = (t: TestContext, experimentStatus: ExperimentStatus, runs: RunSeed[]) => {
  const experimentId = new Types.ObjectId();
  const pathNodeIds = [new Types.ObjectId()];
  const docs = runs.map((run) => ({
    ...run,
    experimentId,
    graphStructureId: new Types.ObjectId(),
    queue: ComputationQueue.local,
    pathNodeIds,
  }));
  const manager = new ComputationManager() as any;
  const created: unknown[] = [];
  const experimentChanges: unknown[] = [];

  stub(t, manager, 'findRunWorkflow', async (runId: Types.ObjectId) => {
    const run = docs.find((d) => String(d._id) === String(runId));
    return run?.status ? { status: run.status } : null;
  });
  stub(t, manager.workflowManager, 'getWorkflow', async () => ({ status: experimentStatus }));
  stub(t, manager.pipelineManager, 'ensureRerunWorkflow', async (runId: Types.ObjectId) => {
    created.push(runId);
  });
  stub(t, manager.experimentManager, 'changeStatus', async (input: unknown) => {
    experimentChanges.push(input);
  });
  stub(t, PipelineModel as any, 'find', () => ({ lean: async () => docs }));
  stub(t, PipelineModel as any, 'create', async (doc: any) => ({
    ...doc,
    _id: new Types.ObjectId(),
  }));

  return { manager, source: docs[0], created, experimentChanges };
};

const completed = (extra: Partial<RunSeed> = {}): RunSeed => ({
  _id: new Types.ObjectId(),
  status: PipelineStatus.completed,
  ...extra,
});

test('re-run of a completed run creates a new run and reopens an optimized experiment', async (t) => {
  const done = completed();
  const { manager, source, created, experimentChanges } = setup(t, ExperimentStatus.completed, [
    done,
  ]);

  const id = await manager.prepareRerun(source);

  assert.notEqual(String(id), String(done._id));
  assert.equal(created.length, 1);
  assert.deepEqual(experimentChanges, [
    { experimentId: source.experimentId, status: ExperimentStatus.computing },
  ]);
});

test('the re-run hangs on the newest run of the path', async (t) => {
  const old = completed({ createdAt: new Date('2026-01-01') });
  const newest = completed({ createdAt: new Date('2026-02-01') });
  const { manager, source } = setup(t, ExperimentStatus.computing, [old, newest]);
  let rerunOf: unknown;
  stub(t, PipelineModel as any, 'create', async (doc: any) => {
    rerunOf = doc.rerunOf;
    return { ...doc, _id: new Types.ObjectId() };
  });

  await manager.prepareRerun(source);

  assert.equal(String(rerunOf), String(newest._id));
});

test('a run left without a workflow by an interrupted admission gets one and is reused', async (t) => {
  const orphan = { _id: new Types.ObjectId() };
  const { manager, source, created, experimentChanges } = setup(t, ExperimentStatus.completed, [
    completed(),
    orphan,
  ]);

  const id = await manager.prepareRerun(source);

  assert.equal(String(id), String(orphan._id));
  assert.deepEqual(created, [orphan._id]);
  // The experiment the interrupted admission left closed is reopened.
  assert.equal(experimentChanges.length, 1);
});

test('a re-run that cannot reopen the experiment leaves no new run behind', async (t) => {
  const { manager, source } = setup(t, ExperimentStatus.completed, [completed()]);
  const removed: unknown[] = [];
  stub(t, manager.experimentManager, 'changeStatus', async () => {
    throw new Error('Файл експерименту не знайдено');
  });
  stub(t, PipelineModel as any, 'deleteOne', async (filter: unknown) => removed.push(filter));
  stub(t, WorkflowModel as any, 'deleteOne', async (filter: unknown) => removed.push(filter));

  await assert.rejects(() => manager.prepareRerun(source), /Файл експерименту/);

  assert.equal(removed.length, 2);
});

test('a second re-run click reuses the run that is already waiting', async (t) => {
  const waiting = { _id: new Types.ObjectId(), status: PipelineStatus.queued };
  const { manager, source, created } = setup(t, ExperimentStatus.computing, [completed(), waiting]);

  const id = await manager.prepareRerun(source);

  assert.equal(String(id), String(waiting._id));
  assert.equal(created.length, 0);
});

test('re-run is rejected while the experiment is optimizing', async (t) => {
  const { manager, source } = setup(t, ExperimentStatus.optimization, [completed()]);

  await assert.rejects(() => manager.prepareRerun(source), /оптимізації/);
});

// The admission waits for another admission's lock and refuses during an optimization.
const lockSequence = (t: TestContext, results: any[]) => {
  const manager = new ComputationManager() as any;
  manager.lockPollMs = 1;
  const acquired: unknown[] = [];
  stub(t, manager.experimentLock, 'acquire', async (...args: unknown[]) => {
    acquired.push(args[1]);
    return results.shift() ?? { acquired: true, token: 'last' };
  });
  return { manager, acquired };
};

test('a re-run admission waits for another admission to let go of the lock', async (t) => {
  const { manager, acquired } = lockSequence(t, [
    { acquired: false, heldBy: 'rerun' },
    { acquired: false, heldBy: 'rerun' },
    { acquired: true, token: 'mine' },
  ]);

  assert.equal(await manager.acquireForRerun(new Types.ObjectId()), 'mine');
  assert.deepEqual(acquired, ['rerun', 'rerun', 'rerun']);
});

test('a re-run admission is refused while an optimization holds the lock', async (t) => {
  const { manager } = lockSequence(t, [{ acquired: false, heldBy: 'optimization' }]);

  await assert.rejects(() => manager.acquireForRerun(new Types.ObjectId()), /оптимізації/);
});

test('a re-run admission gives up when another admission does not finish', async (t) => {
  const { manager } = lockSequence(
    t,
    Array.from({ length: 200 }, () => ({ acquired: false, heldBy: 'rerun' }))
  );

  await assert.rejects(() => manager.acquireForRerun(new Types.ObjectId()), /уже виконується/);
});

test('an admission that failed lets go of the lock and checks readiness again', async (t) => {
  const manager = new ComputationManager() as any;
  const calls: unknown[] = [];
  stub(t, manager, 'acquireForRerun', async () => 'token');
  stub(t, manager, 'prepareRerun', async () => {
    throw new Error('Файл експерименту не знайдено');
  });
  stub(t, manager.experimentLock, 'release', async (...args: unknown[]) => {
    calls.push(['release', args[1]]);
  });
  stub(t, manager, 'reoptimizeIfReady', async () => {
    calls.push(['recheck']);
  });

  await assert.rejects(
    () => manager.admitRerun({ experimentId: new Types.ObjectId() }),
    /Файл експерименту/
  );

  assert.deepEqual(calls, [['release', 'token'], ['recheck']]);
});

test('an admission that succeeded checks readiness again too', async (t) => {
  // A repeated click reused a running run that completed while the lock was held.
  const manager = new ComputationManager() as any;
  const calls: unknown[] = [];
  stub(t, manager, 'acquireForRerun', async () => 'token');
  stub(t, manager, 'prepareRerun', async () => new Types.ObjectId());
  stub(t, manager, 'queueIdle', async () => []);
  stub(t, manager.experimentLock, 'release', async () => {
    calls.push('release');
  });
  stub(t, manager, 'reoptimizeIfReady', async () => {
    calls.push('recheck');
  });

  await manager.admitRerun({ experimentId: new Types.ObjectId() });

  assert.deepEqual(calls, ['release', 'recheck']);
});
const readiness = (
  t: TestContext,
  experiment: { optimization?: { bestPipelineId?: Types.ObjectId } },
  status: ExperimentStatus,
  unfinished: boolean,
  optimize: () => Promise<unknown>
) => {
  const manager = new ComputationManager() as any;
  stub(t, ExperimentModel as any, 'findById', () => ({ lean: async () => experiment }));
  stub(t, manager.workflowManager, 'getWorkflow', async () => ({ status }));
  stub(t, manager, 'hasUncomputedRun', async () => unfinished);
  stub(t, manager, 'optimize', optimize);
  return manager.reoptimizeIfReady(new Types.ObjectId());
};

const optimized = { optimization: { bestPipelineId: new Types.ObjectId() } };

test('an optimized experiment whose runs are all completed is optimized again', async (t) => {
  let runs = 0;
  await readiness(t, optimized, ExperimentStatus.computing, false, async () => void runs++);
  assert.equal(runs, 1);
});

test('a first-time experiment is not optimized automatically', async (t) => {
  let runs = 0;
  await readiness(t, {}, ExperimentStatus.computing, false, async () => void runs++);
  assert.equal(runs, 0);
});

test('an experiment with an unfinished run is left for that run to complete', async (t) => {
  let runs = 0;
  await readiness(t, optimized, ExperimentStatus.computing, true, async () => void runs++);
  assert.equal(runs, 0);
});

test('a busy experiment is left to the lock holder, which checks again when it lets go', async (t) => {
  for (const message of [
    'Оптимізація вже виконується.',
    'Оптимізацію не можна запустити, поки перезапуск ставиться в чергу. Спробуйте ще раз.',
  ]) {
    await readiness(t, optimized, ExperimentStatus.computing, false, async () => {
      throw new Error(message);
    });
  }
});
