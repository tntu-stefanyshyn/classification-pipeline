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
  /** `undefined` is a run that has no workflow yet. */
  status?: PipelineStatus;
  createdAt?: Date;
};

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
  manager.orphanPollMs = 1;
  const created: unknown[] = [];
  const experimentChanges: unknown[] = [];

  stub(t, manager, 'findRunWorkflow', async (runId: Types.ObjectId) => {
    const run = docs.find((d) => String(d._id) === String(runId));
    return run?.status ? { status: run.status } : null;
  });
  stub(t, manager.workflowManager, 'getWorkflow', async () => ({ status: experimentStatus }));
  // Both creation paths (the request and a recovery) go through this atomic get-or-create.
  stub(t, manager, 'ensureRunWorkflow', async (runId: Types.ObjectId) => {
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

test('a simultaneous re-run that loses the race gets the run the other one created', async (t) => {
  const { manager, source, created } = setup(t, ExperimentStatus.computing, [completed()]);
  const winner = { _id: new Types.ObjectId(), status: PipelineStatus.idle };
  stub(t, PipelineModel as any, 'create', async () => {
    throw Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
  });
  stub(t, PipelineModel as any, 'findOne', () => ({ lean: async () => winner }));
  stub(t, manager, 'findRunWorkflow', async (runId: Types.ObjectId) => ({
    status: String(runId) === String(winner._id) ? winner.status : PipelineStatus.completed,
  }));

  const id = await manager.prepareRerun(source);

  assert.equal(String(id), String(winner._id));
  assert.equal(created.length, 0);
});

test('a re-run seen before its workflow exists is waited for, not an error', async (t) => {
  const { manager, source, created } = setup(t, ExperimentStatus.computing, [completed()]);
  // The winner has created the run but not yet its workflow: it appears on the third look.
  const inFlight = { _id: new Types.ObjectId() };
  let looks = 0;
  stub(t, PipelineModel as any, 'find', () => ({ lean: async () => [source, inFlight] }));
  stub(t, manager, 'findRunWorkflow', async (runId: Types.ObjectId) => {
    if (String(runId) === String(source._id)) return { status: PipelineStatus.completed };
    looks += 1;
    return looks < 3 ? null : { status: PipelineStatus.idle };
  });

  const id = await manager.prepareRerun(source);

  assert.equal(String(id), String(inFlight._id));
  assert.equal(created.length, 0);
});

test('a run left without a workflow by a request that died gets one and is reused', async (t) => {
  const { manager, source, created, experimentChanges } = setup(t, ExperimentStatus.completed, [
    completed(),
  ]);
  const orphan = { _id: new Types.ObjectId() };
  stub(t, PipelineModel as any, 'find', () => ({ lean: async () => [source, orphan] }));
  stub(t, manager, 'findRunWorkflow', async (runId: Types.ObjectId) =>
    String(runId) === String(source._id) ? { status: PipelineStatus.completed } : null
  );

  const id = await manager.prepareRerun(source);

  assert.equal(String(id), String(orphan._id));
  assert.deepEqual(created, [orphan._id]);
  // The experiment the dead request left closed is reopened.
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

const reoptimize = async (
  t: TestContext,
  experiment: { optimization?: { bestPipelineId?: Types.ObjectId } },
  status: ExperimentStatus,
  optimize: () => Promise<unknown>
) => {
  const manager = new ComputationManager() as any;
  stub(t, PipelineModel as any, 'findById', () => ({
    lean: async () => ({ experimentId: new Types.ObjectId() }),
  }));
  stub(t, ExperimentModel as any, 'findById', () => ({ lean: async () => experiment }));
  stub(t, manager.workflowManager, 'getWorkflow', async () => ({ status }));
  stub(t, manager, 'optimize', optimize);
  // After an attempt refused for an unfinished run, the run is looked at again: still unfinished.
  stub(t, manager, 'hasUncomputedRun', async () => true);
  await manager.reoptimizeAfterRerun(new Types.ObjectId());
};

test('the last re-run completing optimizes an experiment that was optimized before', async (t) => {
  let runs = 0;
  const optimized = { optimization: { bestPipelineId: new Types.ObjectId() } };
  await reoptimize(t, optimized, ExperimentStatus.computing, async () => void runs++);
  assert.equal(runs, 1);
});

test('a first-time experiment is not optimized automatically', async (t) => {
  let runs = 0;
  await reoptimize(t, {}, ExperimentStatus.computing, async () => void runs++);
  assert.equal(runs, 0);
});

test('a re-run that is not the last one only leaves the optimization for later', async (t) => {
  const optimized = { optimization: { bestPipelineId: new Types.ObjectId() } };
  await reoptimize(t, optimized, ExperimentStatus.computing, async () => {
    throw new Error('There are uncomuted pipelines.');
  });
});

test('re-run is rejected while the experiment is optimizing', async (t) => {
  const { manager, source } = setup(t, ExperimentStatus.optimization, [completed()]);

  await assert.rejects(() => manager.prepareRerun(source), /оптимізації/);
});
