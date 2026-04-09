import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { ComputationQueue } from '../../../modules/computations/classes/ComputationQueue';
import { PipelineStatus } from '../enums';
import { PipelineModel } from '../models/PipelineModel';
import { createExecResult, stub } from '../../../test/testUtils';
import { PipelineManager } from './PipelineManager';

test('PipelineManager.generatePipelinesFromGraphStructure creates pipelines for every path and queue', async (t) => {
  const manager = new PipelineManager();
  const experimentId = new Types.ObjectId().toHexString();
  const rootA = new Types.ObjectId().toHexString();
  const leafA = new Types.ObjectId().toHexString();
  const rootB = new Types.ObjectId().toHexString();
  const createCalls: any[][] = [];
  const workflowCreates: any[] = [];
  const autoQueueCalls: any[] = [];

  stub(t, manager as unknown as Record<string, unknown>, 'graphManager', {
    getByExperimentId: async () => ({
      _id: new Types.ObjectId(),
      settings: {
        queues: [ComputationQueue.local, ComputationQueue.cloud],
      },
      nodes: [
        { _id: rootA, parentId: undefined },
        { _id: leafA, parentId: rootA },
        { _id: rootB, parentId: undefined },
      ],
    }),
  } as any);
  stub(
    t,
    PipelineModel as unknown as Record<string, unknown>,
    'create',
    async (payloads: any[]) => {
      createCalls.push(payloads);
      return payloads.map((payload) => ({
        _id: new Types.ObjectId(),
        ...payload,
      }));
    }
  );
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    create: async (payload: any) => {
      workflowCreates.push(payload);
      return payload;
    },
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'changeStatus', async (payload: any) => {
    autoQueueCalls.push(payload);
    return true;
  });

  const pipelines = await manager.generatePipelinesFromGraphStructure(experimentId);

  assert.equal(pipelines.length, 4);
  assert.equal(createCalls.length, 2);
  assert.deepEqual(
    createCalls.map((payloads) => payloads.length),
    [2, 2]
  );
  assert.equal(workflowCreates.length, 4);
  assert.ok(workflowCreates.every((entry) => entry.status === PipelineStatus.idle));
  assert.equal(autoQueueCalls.length, 2);
  assert.ok(autoQueueCalls.every((entry) => entry.status === PipelineStatus.queued));
});

test('PipelineManager.changeStatus uses default log messages', async (t) => {
  const manager = new PipelineManager();
  const workflowCalls: any[] = [];
  const updateCalls: any[] = [];

  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    changeStatus: async (payload: any) => {
      workflowCalls.push(payload);
      return true;
    },
  } as any);
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createExecResult();
  });

  await manager.changeStatus({
    pipelineId: new Types.ObjectId(),
    status: PipelineStatus.queued,
  } as any);

  assert.equal(workflowCalls[0].message, 'Перехід у чергу');
  assert.equal(updateCalls[0][1].$push.history.message, 'Перехід у чергу');
  assert.equal(updateCalls[0][1].$push.history.status, PipelineStatus.queued);
});

test('PipelineManager.changeStatus trims custom history messages', async (t) => {
  const manager = new PipelineManager();
  const workflowCalls: any[] = [];
  const updateCalls: any[] = [];

  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    changeStatus: async (payload: any) => {
      workflowCalls.push(payload);
      return true;
    },
  } as any);
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createExecResult();
  });

  await manager.changeStatus({
    pipelineId: new Types.ObjectId(),
    status: PipelineStatus.idle,
    message: '  Stopped by user  ',
  } as any);

  assert.equal(workflowCalls[0].message, 'Stopped by user');
  assert.equal(updateCalls[0][1].$push.history.message, 'Stopped by user');
});

test('PipelineManager.changeStatus executes running to completed side effects', async (t) => {
  const manager = new PipelineManager();
  const updateCalls: any[] = [];
  const pipelineId = new Types.ObjectId();

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createExecResult();
  });
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    changeStatus: async (payload: any) => {
      const transition = payload.transitions.find(
        (entry: any) =>
          entry.from === PipelineStatus.running && entry.to === PipelineStatus.completed
      );
      await transition.sideEffect({ instanceId: payload.instanceId });
      return true;
    },
  } as any);

  await manager.changeStatus({
    pipelineId,
    status: PipelineStatus.completed,
  } as any);

  assert.deepEqual(updateCalls[0], [
    { _id: pipelineId },
    { $set: { progress: 100, statusMessage: 'Завершено' } },
  ]);
});

test('PipelineManager.changeStatus executes idle to queued side effects', async (t) => {
  const manager = new PipelineManager();
  const updateCalls: any[] = [];
  const pipelineId = new Types.ObjectId();

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createExecResult();
  });
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    changeStatus: async (payload: any) => {
      const transition = payload.transitions.find(
        (entry: any) => entry.from === PipelineStatus.idle && entry.to === PipelineStatus.queued
      );
      await transition.sideEffect({ instanceId: payload.instanceId });
      return true;
    },
  } as any);

  await manager.changeStatus({
    pipelineId,
    status: PipelineStatus.queued,
  } as any);

  assert.deepEqual(updateCalls[0], [
    { _id: pipelineId },
    {
      $set: {
        progress: 0,
        statusMessage: 'В черзі',
        priority: 0,
      },
      $unset: { machineInfo: '', cloudJobId: '' },
    },
  ]);
});

test('PipelineManager.changeStatus executes queued to running side effects', async (t) => {
  const manager = new PipelineManager();
  const updateCalls: any[] = [];
  const pipelineId = new Types.ObjectId();

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createExecResult();
  });
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    changeStatus: async (payload: any) => {
      const transition = payload.transitions.find(
        (entry: any) => entry.from === PipelineStatus.queued && entry.to === PipelineStatus.running
      );
      await transition.sideEffect({ instanceId: payload.instanceId });
      return true;
    },
  } as any);

  await manager.changeStatus({
    pipelineId,
    status: PipelineStatus.running,
  } as any);

  assert.deepEqual(updateCalls[0], [
    { _id: pipelineId },
    {
      $set: {
        progress: 0,
        statusMessage: 'Обчислення',
      },
    },
  ]);
});

test('PipelineManager.changeStatus executes idle transition reset side effects', async (t) => {
  const manager = new PipelineManager();
  const updateCalls: any[] = [];
  const pipelineId = new Types.ObjectId();

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createExecResult();
  });
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    changeStatus: async (payload: any) => {
      const transition = payload.transitions.find(
        (entry: any) => entry.from === PipelineStatus.running && entry.to === PipelineStatus.idle
      );
      await transition.sideEffect({ instanceId: payload.instanceId });
      return true;
    },
  } as any);

  await manager.changeStatus({
    pipelineId,
    status: PipelineStatus.idle,
  } as any);

  assert.deepEqual(updateCalls[0], [
    { _id: pipelineId },
    { $unset: { machineInfo: '', cloudJobId: '', progress: '', statusMessage: '' } },
  ]);
});
