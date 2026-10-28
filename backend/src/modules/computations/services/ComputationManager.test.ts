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
import { LocalRunSlotModel } from '../models/LocalRunSlotModel';

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
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', async () => ({}));

  assert.equal(await manager.claimNextRun(ComputationQueue.cloud), free);
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

// Mocked slot collection: records every call and answers `findById` with `slot`.
const stubSlots = (t: any, slot: any, onUpdate: (filter: any) => void = () => undefined) => {
  const updates: any[] = [];
  stub(t, LocalRunSlotModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(slot)
  );
  stub(
    t,
    LocalRunSlotModel as unknown as Record<string, unknown>,
    'updateOne',
    async (filter: any, update: any, options: any) => {
      updates.push([filter, update.$set, options]);
      onUpdate(filter);
      return {};
    }
  );
  return updates;
};

test('ComputationManager.claimNextRun leaves a busy machine alone', async (t) => {
  const manager = new ComputationManager();
  const holderId = new Types.ObjectId();
  let holderStatus = PipelineStatus.running;
  let reservedAt = new Date(0);
  let statusChanges = 0;

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    { _id: new Types.ObjectId(), queue: ComputationQueue.local },
  ]);
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult({ status: holderStatus })
  );
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async () => {
      statusChanges += 1;
      return true;
    },
  } as any);
  const updates = stubSlots(t, {
    _id: 'host-a',
    pipelineId: holderId,
    get reservedAt() {
      return reservedAt;
    },
  });
  const claim = () => manager.claimNextRun(ComputationQueue.local, { hostname: 'host-a' } as any);

  // The holder is running.
  assert.equal(await claim(), undefined);
  // The holder is still between its reservation and its status change.
  holderStatus = PipelineStatus.queued;
  reservedAt = new Date();
  assert.equal(await claim(), undefined);

  assert.deepEqual(updates, []);
  assert.equal(statusChanges, 0);
});

test('ComputationManager.claimNextRun loses the machine to a parallel reservation', async (t) => {
  const manager = new ComputationManager();
  let statusChanges = 0;

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    { _id: new Types.ObjectId(), queue: ComputationQueue.local },
  ]);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async () => {
      statusChanges += 1;
      return true;
    },
  } as any);
  // Another worker on the machine reserved the free slot between the read and the upsert.
  stubSlots(t, null, () => {
    throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 });
  });

  assert.equal(
    await manager.claimNextRun(ComputationQueue.local, { hostname: 'host-a' } as any),
    undefined
  );
  assert.equal(statusChanges, 0);
});

test('ComputationManager.claimNextRun moves the machine slot to the next run after a lost race', async (t) => {
  const manager = new ComputationManager();
  const taken = { _id: new Types.ObjectId(), queue: ComputationQueue.local };
  const free = { _id: new Types.ObjectId(), queue: ComputationQueue.local };

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    taken,
    free,
  ]);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async ({ pipelineId }: { pipelineId: Types.ObjectId }) => {
      if (pipelineId === taken._id) throw new WorkflowTransitionConflictError();
      return true;
    },
  } as any);
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'registerMachineInfo',
    async () => undefined
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', async () => ({}));
  const updates = stubSlots(t, null);

  assert.equal(
    await manager.claimNextRun(ComputationQueue.local, { hostname: ' host-a ' } as any),
    free
  );
  assert.deepEqual(
    updates.map(([filter, set]) => [filter, set.pipelineId]),
    [
      [{ _id: 'host-a', pipelineId: null }, taken._id],
      [{ _id: 'host-a', pipelineId: taken._id }, null],
      [{ _id: 'host-a', pipelineId: null }, free._id],
    ]
  );
  assert.deepEqual(
    updates.map(([, , options]) => options?.upsert === true),
    [true, false, true]
  );
});

test('ComputationManager.claimNextRun takes over a slot left by a crashed claim', async (t) => {
  const manager = new ComputationManager();
  const run = { _id: new Types.ObjectId(), queue: ComputationQueue.local };
  const stale = { _id: 'host-a', pipelineId: new Types.ObjectId(), reservedAt: new Date(0) };

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [run]);
  // The holder never reached `running` (or its workflow is gone).
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult(null)
  );
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async () => true,
  } as any);
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'registerMachineInfo',
    async () => undefined
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', async () => ({}));
  const updates = stubSlots(t, stale);

  assert.equal(
    await manager.claimNextRun(ComputationQueue.local, { hostname: 'host-a' } as any),
    run
  );
  // The takeover matches the stale reservation exactly, so only one worker can win it.
  assert.deepEqual(updates[0][0], stale);
  assert.equal(updates[0][1].pipelineId, run._id);
});
