import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import PipelineBaseService from '../../../core/pipeline/services/PipelineBaseService';
import { PipelineModel } from '../../../core/pipeline/models/PipelineModel';
import { PipelineStatus } from '../../../core/pipeline/enums';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { WorkflowModel } from '../../../core/workflow/model/WorkflowModel';
import { ClassificationStage } from '../../experiments/classes/ClassificationStage';
import { ComputationMode } from '../../experiments/classes/ComputationMode';
import { createLeanResult, stub } from '../../../test/testUtils';
import { ComputationManager } from './ComputationManager';
import { WorkflowTransitionConflictError } from '../../../core/workflow/errors';

// claimNextRun reads each candidate's workflow before claiming it.
const stubQueuedWorkflows = (t: any, executionId?: number) =>
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult({ status: PipelineStatus.queued, executionId })
  );
const stubPipelineUpdates = (t: any, calls: any[] = []) =>
  stub(
    t,
    PipelineModel as unknown as Record<string, unknown>,
    'updateOne',
    async (...args: any[]) => {
      calls.push(args);
      return {};
    }
  );

const validMetrics = {
  accuracy: 0.25,
  f1: 0.25,
  rocAuc: 0.25,
  ntps: 0.25,
};

test('ComputationManager.enqueueRuns respects local-only computation mode', async (t) => {
  const manager = new ComputationManager();

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({ _id: new Types.ObjectId() })
  );
  stub(t, manager as unknown as Record<string, unknown>, 'graphManager', {
    getByExperimentId: async () => ({
      settings: {
        metrics: validMetrics,
        queues: [ComputationQueue.cloud],
      },
      computationMode: ComputationMode.local,
      nodes: [],
    }),
  } as any);

  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: new Types.ObjectId(),
        queue: ComputationQueue.cloud,
        runAll: true,
      } as any),
    /лише локальні обчислення/
  );
});

test('ComputationManager.enqueueRuns queues only idle pipelines', async (t) => {
  const manager = new ComputationManager();
  const idlePipelineId = new Types.ObjectId();
  const completedPipelineId = new Types.ObjectId();
  const queueCalls: any[] = [];

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({ _id: new Types.ObjectId() })
  );
  stub(t, manager as unknown as Record<string, unknown>, 'graphManager', {
    getByExperimentId: async () => ({
      settings: {
        metrics: validMetrics,
        queues: [ComputationQueue.local],
      },
      computationMode: ComputationMode.both,
      nodes: [
        {
          _id: new Types.ObjectId().toHexString(),
          stage: ClassificationStage.CLASSIFICATION,
          parentId: undefined,
        },
      ],
    }),
  } as any);
  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'listByExperiment',
    async () => [{ _id: idlePipelineId }, { _id: completedPipelineId }]
  );
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async ({ instanceId }: { instanceId: Types.ObjectId }) => ({
      status:
        String(instanceId) === String(idlePipelineId)
          ? PipelineStatus.idle
          : PipelineStatus.completed,
    }),
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (payload: any) => {
      queueCalls.push(payload);
      return true;
    },
  } as any);

  await manager.enqueueRuns({
    experimentId: new Types.ObjectId(),
    queue: ComputationQueue.local,
    runAll: true,
  } as any);

  assert.deepEqual(queueCalls, [
    {
      pipelineId: idlePipelineId,
      status: PipelineStatus.queued,
    },
  ]);
});

test('ComputationManager.enqueueRuns rejects graphs without classification in every path', async (t) => {
  const manager = new ComputationManager();

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({ _id: new Types.ObjectId() })
  );
  stub(t, manager as unknown as Record<string, unknown>, 'graphManager', {
    getByExperimentId: async () => ({
      settings: {
        metrics: validMetrics,
        queues: [ComputationQueue.local],
      },
      computationMode: ComputationMode.both,
      nodes: [
        {
          _id: new Types.ObjectId().toHexString(),
          stage: ClassificationStage.PREPROCESSING,
          parentId: undefined,
        },
      ],
    }),
  } as any);

  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: new Types.ObjectId(),
        queue: ComputationQueue.local,
        runAll: true,
      } as any),
    /Усі конвеєри мають містити етап класифікації/
  );
});

test('ComputationManager.claimNextRun skips a run that another worker claimed first', async (t) => {
  const manager = new ComputationManager();
  const claimedRun = { _id: new Types.ObjectId(), queue: ComputationQueue.cloud };

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    claimedRun,
  ]);
  stubQueuedWorkflows(t);
  stubPipelineUpdates(t);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async () => {
      throw new WorkflowTransitionConflictError();
    },
  } as any);

  assert.equal(await manager.claimNextRun(ComputationQueue.cloud), undefined);
});

test('ComputationManager.claimNextRun takes the next queued run after losing a race', async (t) => {
  const manager = new ComputationManager();
  const takenByConflict = { _id: new Types.ObjectId(), queue: ComputationQueue.cloud };
  const takenAlready = { _id: new Types.ObjectId(), queue: ComputationQueue.cloud };
  const free = { _id: new Types.ObjectId(), queue: ComputationQueue.cloud };
  const attempts: string[] = [];

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    takenByConflict,
    takenAlready,
    free,
  ]);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async ({ pipelineId }: { pipelineId: Types.ObjectId }) => {
      attempts.push(String(pipelineId));
      if (pipelineId === takenByConflict._id) throw new WorkflowTransitionConflictError();
      // Re-read after another worker already moved it to `running`.
      if (pipelineId === takenAlready._id) throw new Error('TRANSITION_NOT_FOUND');
      return true;
    },
  } as any);
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'registerMachineInfo',
    async () => undefined
  );
  stubQueuedWorkflows(t);
  stubPipelineUpdates(t);

  assert.deepEqual(await manager.claimNextRun(ComputationQueue.cloud), { ...free, executionId: 1 });
  assert.deepEqual(
    attempts,
    [takenByConflict, takenAlready, free].map((run) => String(run._id))
  );
});

test('ComputationManager.claimNextRun rethrows errors that are not lost races', async (t) => {
  const manager = new ComputationManager();

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    { _id: new Types.ObjectId(), queue: ComputationQueue.cloud },
  ]);
  stubQueuedWorkflows(t);
  stubPipelineUpdates(t);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async () => {
      throw new Error('database unavailable');
    },
  } as any);

  await assert.rejects(() => manager.claimNextRun(ComputationQueue.cloud), /database unavailable/);
});

test('ComputationManager.claimNextRun requires a hostname for local runs', async (t) => {
  const manager = new ComputationManager();
  let aggregated = false;
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => {
    aggregated = true;
    return [];
  });

  for (const machineInfo of [undefined, { hostname: '  ' }]) {
    await assert.rejects(
      () => manager.claimNextRun(ComputationQueue.local, machineInfo as any),
      /machineInfo.hostname/
    );
  }
  assert.equal(aggregated, false);
});

test('ComputationManager.claimNextRun starts a new execution and writes the hostname with a local claim', async (t) => {
  const manager = new ComputationManager();
  const run = { _id: new Types.ObjectId(), queue: ComputationQueue.local };
  const statusChanges: any[] = [];
  const pipelineUpdates: any[] = [];

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [run]);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: any[]) => {
      statusChanges.push(args);
      return true;
    },
  } as any);
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'registerMachineInfo',
    async () => undefined
  );
  // The run's previous execution was number 4.
  stubQueuedWorkflows(t, 4);
  stubPipelineUpdates(t, pipelineUpdates);

  const claimed = await manager.claimNextRun(ComputationQueue.local, {
    hostname: ' host-a ',
  } as any);
  await manager.claimNextRun(ComputationQueue.cloud, { hostname: 'host-a' } as any);

  assert.equal(claimed?.executionId, 5);
  // The status change takes the run only if no other claim gave it number 5 first.
  assert.deepEqual(statusChanges, [
    [
      { pipelineId: run._id, status: PipelineStatus.running },
      { executionId: 5, machineHostname: 'host-a' },
      { executionId: 4 },
    ],
    [
      { pipelineId: run._id, status: PipelineStatus.running },
      { executionId: 5 },
      { executionId: 4 },
    ],
  ]);
  // The fence is raised before the status change; machine info is written for this execution only.
  assert.deepEqual(pipelineUpdates[0], [
    { _id: run._id, executionId: { $not: { $gte: 5 } } },
    { $set: { executionId: 5 }, $unset: { computingResult: '' } },
  ]);
  assert.deepEqual(pipelineUpdates[1][0], { _id: run._id, executionId: 5 });
});

test('ComputationManager.claimNextRun skips a candidate that is no longer queued', async (t) => {
  const manager = new ComputationManager();
  let statusChanges = 0;

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    { _id: new Types.ObjectId(), queue: ComputationQueue.cloud },
  ]);
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult({ status: PipelineStatus.running, executionId: 2 })
  );
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async () => {
      statusChanges += 1;
      return true;
    },
  } as any);

  assert.equal(await manager.claimNextRun(ComputationQueue.cloud), undefined);
  assert.equal(statusChanges, 0);
});

test('ComputationManager.claimNextRun stops when the machine already runs a local run', async (t) => {
  const manager = new ComputationManager();
  let attempts = 0;

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    { _id: new Types.ObjectId(), queue: ComputationQueue.local },
    { _id: new Types.ObjectId(), queue: ComputationQueue.local },
  ]);
  stubQueuedWorkflows(t);
  stubPipelineUpdates(t);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async () => {
      attempts += 1;
      // The workflows unique index rejected a second running run for this hostname.
      throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
    },
  } as any);

  assert.equal(
    await manager.claimNextRun(ComputationQueue.local, { hostname: 'host-a' } as any),
    undefined
  );
  assert.equal(attempts, 1);
});
