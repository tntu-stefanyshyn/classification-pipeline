import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { PipelineBaseService, PipelineModel } from '../../core/pipeline';
import { PipelineStatus } from '../../core/pipeline/enums';
import { WorkflowType } from '../../core/workflow/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { config } from '../../config/config';
import { createLeanResult, stub } from '../../test/testUtils';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../experiments/models/GraphStructureModel';
import { ComputationResolver } from './graphql/computation';
import { CompletePipelineInput } from './classes/CompleteExperimentRunInput';
import { ComputationQueue, COMPUTATION_QUEUE_VALUES } from './classes/ComputationQueue';
import { ComputationResult } from './classes/ComputationResult';
import {
  ComputationResultPayload,
  ComputationResultPayloadInput,
} from './classes/ComputationResultPayload';
import { EnqueueExperimentRunsInput } from './classes/EnqueueExperimentRunsInput';
import { FailExperimentRunInput } from './classes/FailExperimentRunInput';
import { OptimizationResult } from './classes/OptimizationResult';
import { StopExperimentRunInput } from './classes/StopExperimentRunInput';
import { ComputationManager } from './services/ComputationManager';
import {
  computationResultsCollectionName,
  ComputationResultModel,
} from './models/ComputationResultModel';
import { OptimizationRunner } from './services/OptimizationRunner';
import * as computationsIndex from './index';

test('computation classes, model metadata and index export are available', () => {
  const now = new Date();
  const completeInput = new CompletePipelineInput();
  const payload = new ComputationResultPayload();
  const payloadInput = new ComputationResultPayloadInput();
  const queueInput = new EnqueueExperimentRunsInput();
  const failInput = new FailExperimentRunInput();
  const optimizationResult = new OptimizationResult();
  const stopInput = new StopExperimentRunInput();
  const result = new ComputationResult();

  payload.accuracyScores = [0.9];
  payload.f1Scores = [0.8];
  payload.rocAucScores = [0.95];
  payload.optimizationIntermediateScores = [0.2];
  payload.sampleCount = 10;
  payload.duration = 1.2;
  payload.confusionMatrix = [[1, 0]];
  payload.confusionMatrixes = [[[1, 0]]];
  payload.channelNames = ['A'];
  payload.predictionSampleCounts = [10];
  payload.predictionSampleCount = 10;
  payload.predictionDataPercent = 20;

  payloadInput.accuracyScores = [0.9];
  payloadInput.f1Scores = [0.8];
  payloadInput.rocAucScores = [0.95];
  payloadInput.optimizationIntermediateScores = [0.2];
  payloadInput.sampleCount = 10;
  payloadInput.duration = 1.2;
  payloadInput.confusionMatrixes = [[[1, 0]]];
  payloadInput.channelNames = ['A'];
  payloadInput.predictionSampleCounts = [10];
  payloadInput.predictionSampleCount = 10;
  payloadInput.predictionDataPercent = 20;

  completeInput.pipelineId = 'pipeline-1';
  completeInput.payload = payloadInput;
  queueInput.experimentId = 'exp-1';
  queueInput.queue = ComputationQueue.local;
  queueInput.pipelineId = 'pipeline-1';
  queueInput.runAll = true;
  queueInput.rerun = false;
  failInput.runId = 'pipeline-1';
  failInput.statusMessage = 'Failed';
  optimizationResult.runId = 'pipeline-1';
  optimizationResult.pathNodeIds = ['node-1'];
  optimizationResult.score = 0.1;
  stopInput.runId = 'pipeline-1';
  result._id = new Types.ObjectId();
  result.pipelineId = new Types.ObjectId();
  result.payload = payload;
  result.createdAt = now;

  assert.ok(COMPUTATION_QUEUE_VALUES.includes(ComputationQueue.cloud));
  assert.equal(computationResultsCollectionName, 'computation_results');
  assert.equal(ComputationResultModel.modelName, 'ComputationResult');
  assert.equal(computationsIndex.ComputationResolver, ComputationResolver);
  assert.equal(result.payload.predictionSampleCount, 10);
  assert.equal(optimizationResult.score, 0.1);
});

test('ComputationResolver delegates all operations to ComputationManager', async (t) => {
  const resolver = new ComputationResolver();
  const pipeline = { _id: new Types.ObjectId() };
  const calls: any[] = [];

  stub(t, resolver as unknown as Record<string, unknown>, 'manager', {
    optimize: async (...args: any[]) => {
      calls.push(['optimize', ...args]);
      return { runId: 'pipeline-1', pathNodeIds: ['node-1'], score: 0.1 };
    },
    enqueueRuns: async (...args: any[]) => {
      calls.push(['enqueue', ...args]);
      return true;
    },
    stopRun: async (...args: any[]) => {
      calls.push(['stop', ...args]);
      return pipeline;
    },
    claimNextRun: async (...args: any[]) => {
      calls.push(['claim', ...args]);
      return pipeline;
    },
    pauseExperimentRuns: async (...args: any[]) => {
      calls.push(['pause', ...args]);
      return [pipeline];
    },
    resumeExperimentRuns: async (...args: any[]) => {
      calls.push(['resume', ...args]);
      return [pipeline];
    },
    completePipeline: async (...args: any[]) => {
      calls.push(['complete', ...args]);
      return true;
    },
  } as any);

  assert.deepEqual(await resolver.optimizeExperimentRuns('exp-1'), {
    runId: 'pipeline-1',
    pathNodeIds: ['node-1'],
    score: 0.1,
  });
  assert.equal(
    await resolver.enqueueExperimentRuns({
      experimentId: 'exp-1',
      queue: ComputationQueue.local,
    } as any),
    true
  );
  assert.equal(await resolver.stopExperimentRun({ runId: 'pipeline-1' } as any), pipeline);
  assert.equal(await resolver.claimExperimentRun(ComputationQueue.local), pipeline);
  assert.deepEqual(await resolver.pauseExperimentRuns('exp-1'), [pipeline]);
  assert.deepEqual(await resolver.resumeExperimentRuns('exp-1'), [pipeline]);
  assert.equal(
    await resolver.completePipeline({ pipelineId: 'pipeline-1', payload: {} } as any),
    true
  );
  assert.equal(calls.length, 7);
});

test('ComputationManager handles optimization and run lifecycle helpers', async (t) => {
  const manager = new ComputationManager();
  const experimentId = new Types.ObjectId();
  const pipelineId = new Types.ObjectId();
  const managerCalls: any[] = [];

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', (id: any) => {
    if (String(id) === String(experimentId)) {
      return createLeanResult({
        _id: experimentId,
        optimization: { bestPipelineId: pipelineId, bestScore: 0.12 },
        computationHosts: [],
      });
    }
    return createLeanResult(null);
  });
  stub(t, GraphStructureModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult({
      settings: {
        metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
        hyperOptimizationMinutesPerPipeline: 5,
      },
      nodes: [{ _id: 'node-1', stage: 'CLASSIFICATION' }],
    })
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'aggregate', async () => []);
  stub(
    t,
    PipelineModel as unknown as Record<string, unknown>,
    'updateOne',
    async (...args: any[]) => {
      managerCalls.push(['updateOne', ...args]);
      return {};
    }
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'find', () => ({
    lean: async () => [{ _id: pipelineId }],
  }));
  stub(t, manager as unknown as Record<string, unknown>, 'workflowManager', {
    getWorkflow: async ({ instanceId }: any) => {
      if (String(instanceId) === String(experimentId)) {
        return { status: 'computing' };
      }
      return { status: PipelineStatus.running };
    },
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'optimizationRunner', {
    run: async (...args: any[]) => {
      managerCalls.push(['runOptimization', ...args]);
    },
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'experimentManager', {
    changeStatus: async (...args: any[]) => {
      managerCalls.push(['changeExperimentStatus', ...args]);
      return true;
    },
  } as any);
  stub(t, manager as unknown as Record<string, unknown>, 'getOptimizationResult', async () => ({
    runId: String(pipelineId),
    pathNodeIds: ['node-1'],
    score: 0.12,
  }));
  stub(t, PipelineBaseService as unknown as Record<string, unknown>, 'getById', async () => ({
    _id: pipelineId,
    pathNodeIds: ['node-1'],
    experimentId,
  }));
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: any[]) => {
      managerCalls.push(['changePipelineStatus', ...args]);
      return true;
    },
  } as any);

  assert.deepEqual(await manager.optimize(experimentId), {
    runId: String(pipelineId),
    pathNodeIds: ['node-1'],
    score: 0.12,
  });

  await manager.completePipeline({ pipelineId: String(pipelineId), payload: { score: 1 } } as any);
  await manager.completeRun({
    runId: String(pipelineId),
    resultJson: JSON.stringify({ score: 1 }),
    statusMessage: 'Done',
  });
  await manager.failRun({ runId: String(pipelineId), statusMessage: 'Failed' });

  assert.equal(
    managerCalls.some((entry) => entry[0] === 'runOptimization'),
    true
  );
  assert.equal(
    managerCalls.some((entry) => entry[0] === 'changePipelineStatus'),
    true
  );
});

test('ComputationManager pauses, resumes and normalizes machine info', async (t) => {
  const manager = new ComputationManager();
  const experimentId = new Types.ObjectId();
  const pipelineId = new Types.ObjectId();
  const calls: any[] = [];

  stub(
    t,
    WorkflowModel as unknown as Record<string, unknown>,
    'aggregate',
    async (pipeline: any) => {
      calls.push(['aggregate', pipeline]);
      return [
        { _id: pipelineId, queue: ComputationQueue.cloud, cloudJobId: 'job-1', experimentId },
      ];
    }
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'find', () => ({
    lean: async () => [{ _id: pipelineId }],
  }));
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({ _id: experimentId, computationHosts: [] })
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
  stub(
    t,
    manager as unknown as Record<string, unknown>,
    'cancelCloudJob',
    async (...args: any[]) => {
      calls.push(['cancelCloudJob', ...args]);
    }
  );
  stub(t, manager as unknown as Record<string, unknown>, 'failRun', async (...args: any[]) => {
    calls.push(['failRun', ...args]);
    return { _id: pipelineId };
  });
  stub(t, manager as unknown as Record<string, unknown>, 'pipelineManager', {
    changeStatus: async (...args: any[]) => {
      calls.push(['changeStatus', ...args]);
      return true;
    },
  } as any);

  assert.deepEqual(await manager.pauseExperimentRuns(experimentId), [{ _id: pipelineId }]);
  assert.deepEqual(await manager.resumeExperimentRuns(experimentId.toHexString()), [
    { _id: pipelineId },
  ]);

  const normalized = (manager as any).normalizeMachineInfo(ComputationQueue.local, {
    hostname: ' host ',
    platform: ' linux ',
    cores: 7.6,
    memoryGb: 15.37,
  });
  assert.equal(normalized.hostname, 'host');
  assert.equal(normalized.platform, 'linux');
  assert.equal(normalized.cores, 8);
  assert.equal(normalized.memoryGb, 15.4);

  await (manager as any).registerMachineInfo(experimentId, {
    queue: ComputationQueue.local,
    hostname: 'host-1',
    lastSeenAt: new Date(),
  });
  assert.equal(
    calls.some((entry) => entry[0] === 'cancelCloudJob'),
    true
  );
  assert.equal(
    calls.some((entry) => entry[0] === 'findByIdAndUpdate'),
    true
  );
});

test('ComputationManager private AWS/result helpers work as expected', async (t) => {
  const manager = new ComputationManager();
  const clientCalls: any[] = [];
  const batchClient = {
    send: async (command: any) => {
      clientCalls.push(command.input);
      if (clientCalls.length === 1) {
        throw new Error('cancel failed');
      }
      return {};
    },
  };

  stub(t, manager as unknown as Record<string, unknown>, 'getBatchClient', () => batchClient);
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({
      optimization: {
        bestPipelineId: new Types.ObjectId(),
        bestScore: 0.2,
      },
    })
  );
  stub(t, PipelineBaseService as unknown as Record<string, unknown>, 'getById', async () => ({
    pathNodeIds: [new Types.ObjectId()],
  }));

  await (manager as any).cancelCloudJob('job-1');
  const optimization = await (manager as any).getOptimizationResult(new Types.ObjectId());

  assert.equal(clientCalls.length, 2);
  assert.equal(optimization.score, 0.2);
});

test('OptimizationRunner resolves backend config and looks up results', async (t) => {
  const runner = new OptimizationRunner();
  const experimentId = new Types.ObjectId();
  const pipelineId = new Types.ObjectId();
  const originalGraphqlUrl = config.backend.graphqlUrl;
  const originalToken = config.backend.serviceToken;
  const pathNodeId = new Types.ObjectId();
  let experimentDoc: any = {
    optimization: {
      bestPipelineId: pipelineId,
      bestScore: 0.12,
    },
  };
  let pipelineDoc: any = { pathNodeIds: [pathNodeId] };

  t.after(() => {
    config.backend.graphqlUrl = originalGraphqlUrl;
    config.backend.serviceToken = originalToken;
  });
  config.backend.graphqlUrl = 'http://localhost:4000/graphql';
  config.backend.serviceToken = 'service-token';

  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(experimentDoc)
  );
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(pipelineDoc)
  );

  const backendConfig = (runner as any).resolveBackendConfig({ experimentId });
  const overrideConfig = (runner as any).resolveBackendConfig({
    experimentId,
    backendUrl: ' http://example.test/graphql ',
    backendToken: ' override-token ',
  });
  config.backend.graphqlUrl = '';
  config.backend.serviceToken = '';
  const fallbackConfig = (runner as any).resolveBackendConfig({ experimentId });
  const lookup = await (runner as any).lookupResult(experimentId);
  experimentDoc = { optimization: {} };
  pipelineDoc = null;

  assert.equal(backendConfig.backendUrl, 'http://localhost:4000/graphql');
  assert.equal(backendConfig.backendToken, 'service-token');
  assert.equal(overrideConfig.backendUrl, 'http://example.test/graphql');
  assert.equal(overrideConfig.backendToken, 'override-token');
  assert.equal(fallbackConfig.backendUrl, `http://host.docker.internal:${config.port}/graphql`);
  assert.equal(fallbackConfig.backendToken, '');
  assert.equal(lookup.best.score, 0.12);
  assert.deepEqual(lookup.best.path_node_ids, [pathNodeId.toHexString()]);
  await assert.rejects(
    () => (runner as any).lookupResult(experimentId),
    /Optimization result is missing/
  );
  experimentDoc = {
    optimization: {
      bestPipelineId: pipelineId,
      bestScore: 0.12,
    },
  };
  await assert.rejects(
    () => (runner as any).lookupResult(experimentId),
    /Best pipeline not found for optimization result/
  );
});
