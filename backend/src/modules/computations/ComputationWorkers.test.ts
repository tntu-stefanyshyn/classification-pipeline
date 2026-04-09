import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Types } from 'mongoose';

import { PipelineBaseService, PipelineModel } from '../../core/pipeline';
import { PipelineStatus } from '../../core/pipeline/enums';
import { WorkflowType } from '../../core/workflow/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { config } from '../../config/config';
import { createLeanResult, stub } from '../../test/testUtils';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../experiments/models/GraphStructureModel';
import { UploadedFileModel } from '../files/models/UploadedFileModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { CloudComputationWorker } from './services/CloudComputationWorker';
import { LocalBackendComputationWorker } from './services/LocalBackendComputationWorker';

test('CloudComputationWorker builds payloads, reads results and submits runs', async (t) => {
  const worker = new CloudComputationWorker() as any;
  const runId = new Types.ObjectId().toHexString();
  const experimentId = new Types.ObjectId();
  const fileId = new Types.ObjectId();
  const pathNodeIds = [new Types.ObjectId(), new Types.ObjectId()];
  const nodeA = {
    _id: pathNodeIds[0],
    stage: 'PREPROCESSING',
    technology: 'CSP',
    settings: [],
  };
  const nodeB = {
    _id: pathNodeIds[1],
    stage: 'CLASSIFICATION',
    technology: 'SVM',
    settings: [{ key: 'kernel', value: 'rbf' }],
  };

  stub(t, os as unknown as Record<string, unknown>, 'cpus', () => [
    { model: 'CPU' },
    { model: 'CPU' },
  ]);
  stub(t, os as unknown as Record<string, unknown>, 'hostname', () => 'host-1');
  stub(t, os as unknown as Record<string, unknown>, 'platform', () => 'linux');
  stub(t, os as unknown as Record<string, unknown>, 'arch', () => 'x64');
  stub(t, os as unknown as Record<string, unknown>, 'release', () => '6.0');
  stub(t, os as unknown as Record<string, unknown>, 'totalmem', () => 16 * 1024 ** 3);

  worker.inputBucket = 'input-bucket';
  worker.resultsBucket = 'results-bucket';
  worker.resultsPrefix = 'prefix';
  worker.jobQueue = 'queue';
  worker.jobDefinition = 'definition';
  worker.jobNamePrefix = 'job';
  const machineInfo = (worker as any).buildMachineInfo();

  const payload = worker.buildPayload(
    runId,
    experimentId,
    fileId,
    'uploads/file.csv',
    [nodeA, nodeB],
    pathNodeIds
  );

  assert.equal(payload.result_s3_key, `prefix/${runId}.json`);
  assert.equal(machineInfo.hostname, 'host-1');

  stub(t, worker, 's3', {
    send: async () => ({
      Body: {
        transformToString: async () =>
          JSON.stringify({ status: 'completed', result: { score: 1 } }),
      },
    }),
  });
  assert.deepEqual(await worker.fetchResultPayload(runId), {
    status: 'completed',
    result: { score: 1 },
  });

  stub(t, worker, 's3', {
    send: async () => {
      throw { $metadata: { httpStatusCode: 404 } };
    },
  });
  assert.equal(await worker.fetchResultPayload(runId), null);

  const batchCalls: any[] = [];
  stub(t, PipelineBaseService as unknown as Record<string, unknown>, 'getById', async () => ({
    _id: runId,
    experimentId,
    pathNodeIds,
  }));
  stub(t, worker, 'workflowManager', {
    getWorkflow: async () => ({ status: PipelineStatus.running }),
  } as any);
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({ _id: experimentId, fileId })
  );
  stub(t, GraphStructureModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult({ nodes: [nodeA, nodeB] })
  );
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult({ storageKey: 'uploads/file.csv' })
  );
  stub(t, worker, 'batch', {
    send: async (command: any) => {
      batchCalls.push(command.input);
      return { jobId: 'aws-job-1' };
    },
  } as any);
  stub(t, PipelineModel as unknown as Record<string, unknown>, 'findOneAndUpdate', () =>
    createLeanResult({ acknowledged: true })
  );

  await worker.submitRun(runId);
  assert.equal(batchCalls[0].jobQueue, 'queue');
});

test('CloudComputationWorker reconciles AWS results into manager calls', async (t) => {
  const worker = new CloudComputationWorker() as any;
  const runId = new Types.ObjectId().toHexString();
  const calls: any[] = [];

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    { pipeline: { _id: runId } },
  ]);
  stub(t, worker, 'fetchResultPayload', async () => ({
    status: 'failed',
    error: 'AWS failed',
  }));
  stub(t, worker, 'manager', {
    failRun: async (...args: any[]) => {
      calls.push(['failRun', ...args]);
    },
    completeRun: async (...args: any[]) => {
      calls.push(['completeRun', ...args]);
    },
  } as any);

  await worker.reconcileRuns();

  assert.deepEqual(calls, [['failRun', { runId, statusMessage: 'AWS failed' }]]);
});

test('LocalBackendComputationWorker resolves backend urls, aws-jobs dir, workflow and machine info', async (t) => {
  const worker = new LocalBackendComputationWorker() as any;
  const originalGraphqlUrl = config.backend.graphqlUrl;
  const originalServiceToken = config.backend.serviceToken;
  const originalAwsJobsDir = process.env.AWS_JOBS_DIR;
  const tempDir = path.join(process.cwd(), 'tmp-aws-jobs-test');

  t.after(() => {
    config.backend.graphqlUrl = originalGraphqlUrl;
    config.backend.serviceToken = originalServiceToken;
    process.env.AWS_JOBS_DIR = originalAwsJobsDir;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(path.join(tempDir, 'Dockerfile'), 'FROM scratch\n');
  process.env.AWS_JOBS_DIR = tempDir;
  config.backend.graphqlUrl = 'http://localhost:4000/graphql';
  config.backend.serviceToken = 'service-token';

  stub(t, os as unknown as Record<string, unknown>, 'platform', () => 'linux');
  stub(t, os as unknown as Record<string, unknown>, 'cpus', () => [{ model: 'CPU' }]);
  stub(t, os as unknown as Record<string, unknown>, 'hostname', () => 'host-1');
  stub(t, os as unknown as Record<string, unknown>, 'arch', () => 'x64');
  stub(t, os as unknown as Record<string, unknown>, 'release', () => '6.0');
  stub(t, os as unknown as Record<string, unknown>, 'totalmem', () => 8 * 1024 ** 3);
  stub(t, console as unknown as Record<string, unknown>, 'warn', () => undefined);
  stub(t, worker, 'workflowManager', {
    getWorkflow: async () => {
      throw new Error('missing workflow');
    },
  } as any);

  assert.equal(worker.resolveContainerBackendUrl(), 'http://host.docker.internal:4000/graphql');
  config.backend.graphqlUrl = 'not-a-valid-url';
  assert.equal(worker.resolveContainerBackendUrl(), 'not-a-valid-url');
  assert.equal(worker.resolveAwsJobsDir(), tempDir);
  assert.equal(await worker.getWorkflow('run-1'), null);
  assert.equal(worker.buildMachineInfo().hostname, 'host-1');
  assert.equal(worker.buildMachineInfo().memoryGb, 8);
});

test('LocalBackendComputationWorker marks unfinished local runs as failed', async (t) => {
  const worker = new LocalBackendComputationWorker() as any;
  const calls: any[] = [];

  stub(t, worker, 'runComputeContainer', async () => undefined);
  stub(t, worker, 'startStatusWatcher', () => () => undefined);
  stub(t, worker, 'getWorkflow', async () => ({ status: PipelineStatus.running }));
  stub(t, worker, 'manager', {
    failRun: async (...args: any[]) => {
      calls.push(['failRun', ...args]);
    },
  } as any);

  await worker.processRun('run-1');

  assert.deepEqual(calls, [
    [
      'failRun',
      {
        runId: 'run-1',
        statusMessage: 'Локальний запуск завершився без фінального статусу.',
      },
    ],
  ]);
});
