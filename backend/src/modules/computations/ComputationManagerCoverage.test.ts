import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { PipelineBaseService, PipelineModel } from '../../core/pipeline';
import { PipelineStatus } from '../../core/pipeline/enums';
import { config } from '../../config/config';
import { createLeanResult, stub } from '../../test/testUtils';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../experiments/models/GraphStructureModel';
import { ClassificationStage } from '../experiments/classes/ClassificationStage';
import { ComputationMode } from '../experiments/classes/ComputationMode';
import { ExperimentStatus } from '../experiments/classes/ExperimentStatus';
import { OptimizationStatus } from '../experiments/classes/OptimizationStatus';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { ComputationManager } from './services/ComputationManager';

const createGraph = (overrides: Record<string, unknown> = {}) => ({
  settings: {
    metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
    queues: [ComputationQueue.local, ComputationQueue.cloud],
    hyperOptimizationMinutesPerPipeline: 2,
  },
  computationMode: ComputationMode.both,
  nodes: [
    {
      _id: new Types.ObjectId(),
      stage: ClassificationStage.CLASSIFICATION,
      technology: 'SVM',
      settings: [],
    },
  ],
  ...overrides,
});

test('ComputationManager.optimize validates workflow and graph prerequisites', async (t) => {
  const manager = new ComputationManager();
  const experimentId = new Types.ObjectId();
  const result = { runId: 'run-1', pathNodeIds: ['node-1'], score: 0.9 };
  const calls: any[] = [];
  let experimentDoc: any = null;
  let workflowStatus = ExperimentStatus.computing;
  let graphDoc: any = createGraph();
  let aggregateResult: any[] = [];

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(experimentDoc)
  );
  stub(t, GraphStructureModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult(graphDoc)
  );
  stub(
    t,
    PipelineModel as unknown as Record<string, unknown>,
    'aggregate',
    async () => aggregateResult
  );
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async () => ({ status: workflowStatus }),
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'experimentManager', {
    changeStatus: async (...args: any[]) => {
      calls.push(['changeStatus', ...args]);
      return true;
    },
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'optimizationRunner', {
    run: async (...args: any[]) => {
      calls.push(['run', ...args]);
    },
  } as any);
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'getOptimizationResult',
    async () => result
  );

  await assert.rejects(() => manager.optimize(experimentId), /Experiment not found/);

  experimentDoc = { _id: experimentId, optimization: { status: OptimizationStatus.optimizing } };
  workflowStatus = ExperimentStatus.optimization;
  await assert.rejects(() => manager.optimize(experimentId), /Оптимізація вже виконується/);

  experimentDoc = { _id: experimentId, optimization: { status: OptimizationStatus.failed } };
  workflowStatus = ExperimentStatus.configuring;
  await assert.rejects(
    () => manager.optimize(experimentId),
    /Оптимізацію можна запускати лише зі статусів/
  );

  workflowStatus = ExperimentStatus.completed;
  graphDoc = { settings: {}, nodes: [] };
  await assert.rejects(() => manager.optimize(experimentId), /Graph metrics are not configured/);

  graphDoc = { settings: createGraph().settings, nodes: [] };
  await assert.rejects(() => manager.optimize(experimentId), /Graph has no paths for optimization/);

  graphDoc = createGraph();
  aggregateResult = [{ _id: new Types.ObjectId() }];
  await assert.rejects(() => manager.optimize(experimentId), /There are uncomuted pipelines/);

  aggregateResult = [];
  workflowStatus = ExperimentStatus.optimization;
  calls.length = 0;
  assert.deepEqual(await manager.optimize(experimentId), result);
  assert.deepEqual(
    calls.filter((entry) => entry[0] === 'changeStatus').map((entry) => entry[1].status),
    [ExperimentStatus.completed]
  );
  assert.equal(calls.find((entry) => entry[0] === 'run')?.[1].timeoutSeconds, 120);

  workflowStatus = ExperimentStatus.completed;
  calls.length = 0;
  await manager.optimize(experimentId);
  assert.deepEqual(
    calls.filter((entry) => entry[0] === 'changeStatus').map((entry) => entry[1].status),
    [ExperimentStatus.optimization, ExperimentStatus.completed]
  );
});

test('ComputationManager.enqueueRuns validates graph settings and queues selected runs', async (t) => {
  const manager = new ComputationManager();
  const experimentId = new Types.ObjectId();
  const pipelineId = new Types.ObjectId();
  const calls: any[] = [];
  let experimentDoc: any = { _id: experimentId };
  let graphDoc: any = createGraph();
  let workflowStatus = PipelineStatus.idle;

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(experimentDoc)
  );
  stub(t, manager as unknown as Record<string, unknown>, 'graphManager', {
    getByExperimentId: async () => graphDoc,
  } as any);
  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'listByExperiment',
    async () => [{ _id: pipelineId }]
  );
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async () => ({ status: workflowStatus }),
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: any[]) => {
      calls.push(['changeStatus', ...args]);
      return true;
    },
  } as any);

  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        runAll: true,
        queue: ComputationQueue.local,
      } as any),
    /Provide either runAll or pathNodeIds/
  );

  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /Path node ids are required/
  );

  experimentDoc = null;
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /Experiment not found/
  );

  experimentDoc = { _id: experimentId };
  graphDoc = { settings: undefined, nodes: [] };
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /Спочатку заповніть налаштування графа/
  );

  graphDoc = createGraph();
  graphDoc.settings.queues = [];
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /Оберіть хоча б один тип обчислень/
  );

  graphDoc = createGraph();
  graphDoc.settings.queues = [ComputationQueue.cloud];
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /не дозволений/
  );

  graphDoc = createGraph();
  graphDoc.settings.metrics = { accuracy: Number.NaN, f1: 0.25, rocAuc: 0.25, ntps: 0.5 };
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /Налаштування ваг метрик некоректні/
  );

  graphDoc = createGraph();
  graphDoc.settings.metrics = { accuracy: 0.3, f1: 0.3, rocAuc: 0.3, ntps: 0 };
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /Налаштування ваг метрик некоректні/
  );

  graphDoc = createGraph({ computationMode: ComputationMode.cloud });
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /дозволяє лише хмарні/
  );

  graphDoc = createGraph({ computationMode: ComputationMode.local });
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.cloud,
      } as any),
    /дозволяє лише локальні/
  );

  graphDoc = createGraph({ nodes: [] });
  await assert.rejects(
    () =>
      manager.enqueueRuns({
        experimentId: experimentId.toHexString(),
        pipelineId: pipelineId.toHexString(),
        queue: ComputationQueue.local,
      } as any),
    /Graph has no paths to run/
  );

  graphDoc = createGraph();
  calls.length = 0;
  await manager.enqueueRuns({
    experimentId: experimentId.toHexString(),
    pipelineId: pipelineId.toHexString(),
    queue: ComputationQueue.local,
  } as any);
  assert.deepEqual(calls, [['changeStatus', { pipelineId, status: PipelineStatus.queued }]]);

  workflowStatus = PipelineStatus.running;
  calls.length = 0;
  await manager.enqueueRuns({
    experimentId: experimentId.toHexString(),
    runAll: true,
    queue: ComputationQueue.local,
  } as any);
  assert.equal(calls.length, 0);
});

test('ComputationManager.stopRun and claimNextRun cover queue transitions and machine info', async (t) => {
  const manager = new ComputationManager();
  const experimentId = new Types.ObjectId();
  const pipelineId = new Types.ObjectId();
  const queuedPipelineId = new Types.ObjectId();
  const updatedPipeline = { _id: pipelineId, updated: true };
  const calls: any[] = [];
  let currentPipeline: any = { _id: pipelineId, experimentId, queue: ComputationQueue.local };
  let workflowStatus = PipelineStatus.idle;
  let returnUpdatedPipeline = false;
  let aggregateCall = 0;

  stub(t, PipelineBaseService as unknown as Record<string, unknown>, 'getById', async () =>
    returnUpdatedPipeline ? updatedPipeline : currentPipeline
  );
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async () => ({ status: workflowStatus }),
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: any[]) => {
      calls.push(['changeStatus', ...args]);
      returnUpdatedPipeline = true;
      return true;
    },
  } as any);
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'cancelCloudJob',
    async (...args: any[]) => {
      calls.push(['cancelCloudJob', ...args]);
    }
  );
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => {
    aggregateCall += 1;
    if (aggregateCall === 1) return [{}];
    if (aggregateCall === 2) return [];
    if (aggregateCall === 3) return [];
    return [
      {
        _id: queuedPipelineId,
        experimentId,
        queue: ComputationQueue.cloud,
      },
    ];
  });
  stub(
    t,
    PipelineModel as unknown as Record<string, unknown>,
    'updateOne',
    async (...args: any[]) => {
      calls.push(['updateOne', ...args]);
      return {};
    }
  );
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'registerMachineInfo',
    async (...args: any[]) => {
      calls.push(['registerMachineInfo', ...args]);
    }
  );

  assert.equal(await manager.stopRun(pipelineId.toHexString()), currentPipeline);

  currentPipeline = {
    _id: pipelineId,
    experimentId,
    queue: ComputationQueue.cloud,
    cloudJobId: 'aws-job-1',
  };
  workflowStatus = PipelineStatus.running;
  returnUpdatedPipeline = false;
  assert.deepEqual(await manager.stopRun(pipelineId.toHexString()), updatedPipeline);
  assert.equal(
    calls.some((entry) => entry[0] === 'cancelCloudJob' && entry[1] === 'aws-job-1'),
    true
  );

  assert.equal(await manager.claimNextRun(ComputationQueue.local), undefined);
  assert.equal(await manager.claimNextRun(ComputationQueue.local), undefined);

  const claimed = await manager.claimNextRun(ComputationQueue.cloud, {
    hostname: ' host ',
    platform: ' linux ',
    arch: ' x64 ',
    release: ' 6.0 ',
    cpuModel: ' cpu ',
    gpuModel: ' gpu ',
    cores: 7.6,
    memoryGb: 15.37,
    appVersion: ' 1.2.3 ',
  });

  assert.equal(claimed?._id, queuedPipelineId);
  assert.equal(
    calls.some(
      (entry) =>
        entry[0] === 'changeStatus' &&
        entry[1].pipelineId?.toString() === queuedPipelineId.toString() &&
        entry[1].status === PipelineStatus.running
    ),
    true
  );
  assert.deepEqual(calls.find((entry) => entry[0] === 'updateOne')?.[2], {
    $set: {
      machineInfo: {
        queue: ComputationQueue.cloud,
        lastSeenAt: calls.find((entry) => entry[0] === 'updateOne')?.[2].$set.machineInfo
          .lastSeenAt,
        hostname: 'host',
        platform: 'linux',
        arch: 'x64',
        release: '6.0',
        cpuModel: 'cpu',
        gpuModel: 'gpu',
        cores: 8,
        memoryGb: 15.4,
        appVersion: '1.2.3',
      },
    },
  });
  const normalizedWithoutInput = (manager as any).normalizeMachineInfo(ComputationQueue.local);
  assert.equal(normalizedWithoutInput.queue, ComputationQueue.local);
  assert.equal(normalizedWithoutInput.hostname, undefined);
  assert.equal(normalizedWithoutInput.lastSeenAt instanceof Date, true);
});

test('ComputationManager helper branches cover empty resumes, registerMachineInfo and AWS fallbacks', async (t) => {
  const manager = new ComputationManager();
  const experimentId = new Types.ObjectId();
  const pipelineId = new Types.ObjectId();
  const pipeline = { _id: pipelineId };
  const calls: any[] = [];
  let experimentDoc: any = null;

  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'getById',
    async () => pipeline
  );
  stub(
    t,
    PipelineModel as unknown as Record<string, unknown>,
    'updateOne',
    async (...args: any[]) => {
      calls.push(['updateOne', ...args]);
      return {};
    }
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'find', () => ({
    lean: async () => [],
  }));
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async () => ({ status: PipelineStatus.completed }),
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: any[]) => {
      calls.push(['changeStatus', ...args]);
      return true;
    },
  } as any);
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => []);
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(experimentDoc)
  );
  stub(
    t,
    ExperimentModel as unknown as Record<string, unknown>,
    'findByIdAndUpdate',
    async (...args: any[]) => {
      calls.push(['findByIdAndUpdate', ...args]);
      return {};
    }
  );
  stub(t, manager as unknown as Record<string, unknown>, 'getBatchClient', () => ({
    send: async () => {
      throw new Error('batch failed');
    },
  }));
  stub(t, console as unknown as Record<string, unknown>, 'warn', (...args: any[]) => {
    calls.push(['warn', ...args]);
  });

  await manager.completeRun({ runId: pipelineId.toHexString(), resultJson: '{"score":1}' });
  assert.equal(
    calls.some(
      (entry) => entry[0] === 'changeStatus' && entry[1].status === PipelineStatus.completed
    ),
    false
  );

  assert.equal(await manager.failRun({ runId: pipelineId.toHexString() }), pipeline);
  assert.deepEqual(await manager.pauseExperimentRuns(experimentId), []);
  assert.deepEqual(await manager.resumeExperimentRuns(experimentId.toHexString()), []);
  await assert.rejects(() => manager.resumeExperimentRuns('   '), /Experiment _id is required/);
  await assert.rejects(() => manager.resumeExperimentRuns('bad-id'), /Experiment _id is invalid/);

  await (manager as any).registerMachineInfo(experimentId, {
    queue: ComputationQueue.local,
    hostname: 'host-1',
    lastSeenAt: new Date(),
  });
  assert.equal(
    calls.some((entry) => entry[0] === 'findByIdAndUpdate'),
    false
  );

  experimentDoc = { computationHosts: [] };
  await (manager as any).registerMachineInfo(experimentId, {
    queue: ComputationQueue.local,
    hostname: 'host-1',
    lastSeenAt: new Date(),
  });
  assert.equal(
    calls.some((entry) => entry[0] === 'findByIdAndUpdate'),
    true
  );

  await (manager as any).cancelCloudJob('');
  await (manager as any).cancelCloudJob('job-1');
  assert.equal(
    calls.some((entry) => entry[0] === 'warn'),
    true
  );

  await (manager as any).syncExperimentStatus(experimentId.toHexString());
  experimentDoc = { optimization: {} };
  await assert.rejects(
    () => (manager as any).getOptimizationResult(experimentId),
    /Optimization result is missing/
  );
});

test('ComputationManager merges machine hosts and reuses initialized batch client', async (t) => {
  const manager = new ComputationManager();
  const experimentId = new Types.ObjectId();
  const calls: any[] = [];
  const originalConfig = {
    awsRegion: config.aws.region,
    awsAccessKeyId: config.aws.accessKeyId,
    awsSecretAccessKey: config.aws.secretAccessKey,
  };
  let experimentDoc: any = {
    computationHosts: [
      {
        queue: ComputationQueue.local,
        hostname: 'old-host',
        lastSeenAt: new Date('2024-01-01T00:00:00.000Z'),
      },
    ],
  };

  t.after(() => {
    config.aws.region = originalConfig.awsRegion;
    config.aws.accessKeyId = originalConfig.awsAccessKeyId;
    config.aws.secretAccessKey = originalConfig.awsSecretAccessKey;
  });

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(experimentDoc)
  );
  stub(
    t,
    ExperimentModel as unknown as Record<string, unknown>,
    'findByIdAndUpdate',
    async (...args: any[]) => {
      calls.push(['findByIdAndUpdate', ...args]);
      return {};
    }
  );

  config.aws.region = 'eu-central-1';
  config.aws.accessKeyId = 'key';
  config.aws.secretAccessKey = 'secret';
  const batchClient = (manager as any).getBatchClient();
  const sameBatchClient = (manager as any).getBatchClient();
  assert.equal(batchClient, sameBatchClient);

  await (manager as any).registerMachineInfo(experimentId, {
    queue: ComputationQueue.local,
    hostname: 'new-host',
  });
  assert.equal(
    calls.some(
      (entry) =>
        entry[0] === 'findByIdAndUpdate' &&
        entry[2].$set.computationHosts[0].hostname === 'new-host' &&
        entry[2].$set.computationHosts[0].lastSeenAt.toISOString() === '2024-01-01T00:00:00.000Z'
    ),
    true
  );

  calls.length = 0;
  stub(t, manager as unknown as Record<string, unknown>, 'getBatchClient', () => ({
    send: async (...args: any[]) => {
      calls.push(['send', ...args]);
      return {};
    },
  }));
  await (manager as any).cancelCloudJob('job-success');
  assert.equal(
    calls.some((entry) => entry[0] === 'send'),
    true
  );
});
