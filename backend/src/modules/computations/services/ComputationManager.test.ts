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

test('ComputationManager.claimNextRun limits local runs per machine', async (t) => {
  const manager = new ComputationManager();
  const guardMatches: any[] = [];

  stub(
    t,
    WorkflowModel as unknown as Record<string, unknown>,
    'aggregate',
    async (stages: any[]) => {
      const guard = stages.find((stage) => stage.$match?.['pipeline.queue']);
      if (guard) {
        guardMatches.push(guard.$match);
        return [{ _id: new Types.ObjectId() }];
      }
      return [];
    }
  );

  assert.equal(
    await manager.claimNextRun(ComputationQueue.local, { hostname: ' host-a ' } as any),
    undefined
  );
  assert.equal(await manager.claimNextRun(ComputationQueue.local), undefined);

  assert.deepEqual(guardMatches, [
    { 'pipeline.queue': ComputationQueue.local, 'pipeline.machineInfo.hostname': 'host-a' },
    { 'pipeline.queue': ComputationQueue.local },
  ]);
});
