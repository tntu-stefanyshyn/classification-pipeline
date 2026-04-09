import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import PipelineBaseService from '../../../core/pipeline/services/PipelineBaseService';
import { PipelineStatus } from '../../../core/pipeline/enums';
import { ComputationQueue } from '../classes/ComputationQueue';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { ClassificationStage } from '../../experiments/classes/ClassificationStage';
import { ComputationMode } from '../../experiments/classes/ComputationMode';
import { createLeanResult, stub } from '../../../test/testUtils';
import { ComputationManager } from './ComputationManager';

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
