import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Types } from 'mongoose';

import { PipelineModel } from '../../core/pipeline/models/PipelineModel';
import { PipelineStatus } from '../../core/pipeline/enums';
import { stub } from '../../test/testUtils';
import { ExperimentStatus } from '../experiments/classes/ExperimentStatus';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { ComputationManager } from './services/ComputationManager';

const setup = (
  t: TestContext,
  experimentStatus: ExperimentStatus,
  runs: { _id: Types.ObjectId; status: PipelineStatus }[]
) => {
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

  stub(t, manager.workflowManager, 'getWorkflow', async ({ instanceId }: any) => ({
    status: docs.find((d) => String(d._id) === String(instanceId))?.status ?? experimentStatus,
  }));
  stub(t, manager.workflowManager, 'create', async (input: unknown) => {
    created.push(input);
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

test('re-run of a completed run creates a new run and reopens an optimized experiment', async (t) => {
  const done = { _id: new Types.ObjectId(), status: PipelineStatus.completed };
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

test('a second re-run click reuses the run that is already waiting', async (t) => {
  const done = { _id: new Types.ObjectId(), status: PipelineStatus.completed };
  const waiting = { _id: new Types.ObjectId(), status: PipelineStatus.queued };
  const { manager, source, created } = setup(t, ExperimentStatus.computing, [done, waiting]);

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
  const done = { _id: new Types.ObjectId(), status: PipelineStatus.completed };
  const { manager, source } = setup(t, ExperimentStatus.optimization, [done]);

  await assert.rejects(() => manager.prepareRerun(source), /оптимізації/);
});
