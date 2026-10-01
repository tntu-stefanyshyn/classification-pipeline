import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { ComputationQueue } from '../../modules/computations/classes/ComputationQueue';
import { GraphStructureModel } from '../../modules/experiments/models/GraphStructureModel';
import { PipelineBaseService, PipelineModel, Pipeline, pipelinesCollectionName } from './index';
import { ChangePipelineStatusInput } from './classes/ChangePipelineStatusInput';
import { PipelineHistoryItem } from './classes/PipelineHistoryItem';
import { PipelineMachineInfo, PipelineMachineInfoInput } from './classes/PipelineMachineInfo';
import { UpdatePipelineOptimizationInput } from './classes/UpdatePipelineOptimizationInput';
import { UpdatePipelineProgressInput } from './classes/UpdatePipelineProgressInput';
import { PipelineStatus } from './enums';
import { PipelineResolver } from './graphql/pipeline';
import { createLeanResult, stub } from '../../test/testUtils';

test('core pipeline classes keep assigned values and exports remain available', () => {
  const now = new Date();
  const pipeline = new Pipeline();
  const historyItem = new PipelineHistoryItem();
  const machineInfo = new PipelineMachineInfo();
  const machineInfoInput = new PipelineMachineInfoInput();
  const changeStatusInput = new ChangePipelineStatusInput();
  const updateOptimizationInput = new UpdatePipelineOptimizationInput();
  const updateProgressInput = new UpdatePipelineProgressInput();

  pipeline._id = new Types.ObjectId();
  pipeline.experimentId = new Types.ObjectId();
  pipeline.graphStructureId = new Types.ObjectId();
  pipeline.queue = ComputationQueue.local;
  pipeline.pathNodeIds = [new Types.ObjectId()];
  pipeline.progress = 25;
  pipeline.statusMessage = 'Running';
  pipeline.history = [];
  pipeline.machineInfo = machineInfo;
  pipeline.optimizationScores = [0.92];
  pipeline.priority = 2;
  pipeline.cloudJobId = 'job-1';
  pipeline.createdAt = now;
  pipeline.updatedAt = now;

  historyItem.message = 'Queued';
  historyItem.status = PipelineStatus.queued;
  historyItem.createdAt = now;

  machineInfo.hostname = 'host-1';
  machineInfo.platform = 'linux';
  machineInfo.arch = 'x64';
  machineInfo.release = '1.0';
  machineInfo.cpuModel = 'cpu';
  machineInfo.gpuModel = 'gpu';
  machineInfo.cores = 8;
  machineInfo.memoryGb = 32;
  machineInfo.appVersion = '0.1.0';
  machineInfo.queue = ComputationQueue.cloud;
  machineInfo.lastSeenAt = now;

  machineInfoInput.hostname = 'host-1';
  machineInfoInput.platform = 'linux';
  machineInfoInput.arch = 'x64';
  machineInfoInput.release = '1.0';
  machineInfoInput.cpuModel = 'cpu';
  machineInfoInput.gpuModel = 'gpu';
  machineInfoInput.cores = 8;
  machineInfoInput.memoryGb = 32;
  machineInfoInput.appVersion = '0.1.0';

  changeStatusInput.pipelineId = pipeline._id;
  changeStatusInput.status = PipelineStatus.running;
  changeStatusInput.message = 'Start';

  updateOptimizationInput.pipelineId = pipeline._id;
  updateOptimizationInput.score = 0.91;

  updateProgressInput.pipelineId = pipeline._id;
  updateProgressInput.progress = 40;
  updateProgressInput.message = 'Progress';

  assert.equal(pipelinesCollectionName, 'pipelines');
  assert.equal(PipelineModel.modelName, 'Pipeline');
  assert.equal(pipeline.queue, ComputationQueue.local);
  assert.equal(historyItem.status, PipelineStatus.queued);
  assert.equal(machineInfo.queue, ComputationQueue.cloud);
  assert.equal(machineInfoInput.hostname, 'host-1');
  assert.equal(changeStatusInput.status, PipelineStatus.running);
  assert.equal(updateOptimizationInput.score, 0.91);
  assert.equal(updateProgressInput.progress, 40);
  assert.equal(typeof PipelineBaseService.getById, 'function');
});

test('PipelineBaseService.listByExperiment applies queue filter when present', async (t) => {
  const calls: any[] = [];
  const expected = [{ _id: new Types.ObjectId() }];

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'find', (query: any) => {
    calls.push(query);
    return {
      sort(sort: any) {
        calls.push(sort);
        return {
          lean: async () => expected,
        };
      },
    };
  });

  const result = await PipelineBaseService.listByExperiment('exp-1', ComputationQueue.local);

  assert.equal(result, expected);
  assert.deepEqual(calls, [
    { experimentId: 'exp-1', queue: ComputationQueue.local },
    { createdAt: -1 },
  ]);
});

test('PipelineBaseService.getById returns found pipelines and rejects missing ones', async (t) => {
  const existingPipeline = { _id: new Types.ObjectId() };
  const responses = [existingPipeline, null];

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(responses.shift())
  );

  assert.equal(await PipelineBaseService.getById('pipeline-1'), existingPipeline);
  await assert.rejects(() => PipelineBaseService.getById('pipeline-2'), /Конвеєр не знайдено/);
});

test('PipelineBaseService.updatePipelineProgress updates progress and optional history', async (t) => {
  const updateCalls: any[] = [];
  const pipeline = { _id: new Types.ObjectId(), progress: 55 };

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createLeanResult({ acknowledged: true });
  });
  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'getById',
    async () => pipeline
  );

  const result = await PipelineBaseService.updatePipelineProgress({
    pipelineId: 'pipeline-1',
    progress: 55,
    message: 'Halfway',
    status: PipelineStatus.running,
  } as any);

  assert.equal(result, pipeline);
  assert.deepEqual(updateCalls[0][0], { _id: 'pipeline-1' });
  assert.equal(updateCalls[0][1].$set.progress, 55);
  assert.equal(updateCalls[0][1].$push.history.message, 'Halfway');
  assert.equal(updateCalls[0][1].$push.history.status, PipelineStatus.running);
});

test('PipelineBaseService.updatePipelineProgress skips history when message and status are absent', async (t) => {
  const updateCalls: any[] = [];

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createLeanResult({ acknowledged: true });
  });
  stub(t, PipelineBaseService as unknown as Record<string, unknown>, 'getById', async () => ({
    _id: 'pipeline-1',
  }));

  await PipelineBaseService.updatePipelineProgress({
    pipelineId: 'pipeline-1',
  } as any);

  assert.deepEqual(updateCalls[0][1], { $set: {} });
});

test('PipelineBaseService.updatePipelineOptimization appends optimization scores', async (t) => {
  const updateCalls: any[] = [];
  const pipeline = { _id: new Types.ObjectId(), optimizationScores: [0.8, 0.9] };

  stub(t, PipelineModel as unknown as Record<string, unknown>, 'updateOne', (...args: any[]) => {
    updateCalls.push(args);
    return createLeanResult({ acknowledged: true });
  });
  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'getById',
    async () => pipeline
  );

  const result = await PipelineBaseService.updatePipelineOptimization({
    pipelineId: 'pipeline-1',
    score: 0.9,
  } as any);

  assert.equal(result, pipeline);
  assert.deepEqual(updateCalls[0], [{ _id: 'pipeline-1' }, { $push: { optimizationScores: 0.9 } }]);
});

test('PipelineResolver.pathNodes preserves pipeline order', async (t) => {
  const resolver = new PipelineResolver();
  const nodeA = { _id: new Types.ObjectId(), label: 'A' };
  const nodeB = { _id: new Types.ObjectId(), label: 'B' };
  const aggregateCalls: any[] = [];

  stub(
    t,
    GraphStructureModel as unknown as Record<string, unknown>,
    'aggregate',
    (pipeline: any) => {
      aggregateCalls.push(pipeline);
      return [nodeB, nodeA];
    }
  );

  const result = await resolver.pathNodes({
    experimentId: 'exp-1',
    pathNodeIds: [nodeA._id, nodeB._id],
  } as any);

  assert.deepEqual(aggregateCalls[0], [
    { $match: { experimentId: 'exp-1' } },
    { $unwind: '$nodes' },
    { $replaceRoot: { newRoot: '$nodes' } },
    { $match: { _id: { $in: [nodeA._id, nodeB._id] } } },
  ]);
  assert.deepEqual(result, [nodeA, nodeB]);
});

test('PipelineResolver delegates status, queries and mutations', async (t) => {
  const resolver = new PipelineResolver();
  const pipeline = { _id: new Types.ObjectId() };
  const listCalls: any[] = [];
  const getByIdCalls: any[] = [];
  const progressCalls: any[] = [];
  const optimizationCalls: any[] = [];
  const statusCalls: any[] = [];
  const workflowCalls: any[] = [];

  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'listByExperiment',
    async (...args: any[]) => {
      listCalls.push(args);
      return [pipeline];
    }
  );
  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'getById',
    async (...args: any[]) => {
      getByIdCalls.push(args);
      return pipeline;
    }
  );
  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'updatePipelineProgress',
    async (...args: any[]) => {
      progressCalls.push(args);
      return pipeline;
    }
  );
  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'updatePipelineOptimization',
    async (...args: any[]) => {
      optimizationCalls.push(args);
      return pipeline;
    }
  );
  stub(t, resolver as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: any[]) => {
      statusCalls.push(args);
      return true;
    },
  } as any);
  stub(t, resolver as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async (...args: any[]) => {
      workflowCalls.push(args);
      return { status: PipelineStatus.completed };
    },
  } as any);

  assert.equal(await resolver.status({ _id: pipeline._id } as any), PipelineStatus.completed);
  assert.deepEqual(await resolver.pipelines('exp-1', ComputationQueue.cloud), [pipeline]);
  assert.equal(await resolver.pipeline('pipeline-1'), pipeline);
  assert.equal(
    await resolver.updatePipelineProgress({ pipelineId: 'pipeline-1' } as any),
    pipeline
  );
  assert.equal(
    await resolver.updatePipelineOptimization({ pipelineId: 'pipeline-1', score: 0.9 } as any),
    true
  );
  assert.equal(
    await resolver.changePipelineStatus({
      pipelineId: 'pipeline-1',
      status: PipelineStatus.queued,
    } as any),
    true
  );

  assert.deepEqual(listCalls[0], ['exp-1', ComputationQueue.cloud]);
  assert.deepEqual(getByIdCalls[0], ['pipeline-1']);
  assert.deepEqual(progressCalls[0], [{ pipelineId: 'pipeline-1' }]);
  assert.deepEqual(optimizationCalls[0], [{ pipelineId: 'pipeline-1', score: 0.9 }]);
  assert.deepEqual(statusCalls[0], [{ pipelineId: 'pipeline-1', status: PipelineStatus.queued }]);
  assert.deepEqual(workflowCalls[0], [{ instanceId: pipeline._id, type: 'PIPELINE' }]);
});
