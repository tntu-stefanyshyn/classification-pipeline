import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { setTimeout as wait } from 'node:timers/promises';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { PipelineBaseService, PipelineModel } from '../../core/pipeline';
import { PipelineStatus } from '../../core/pipeline/enums';
import { WorkflowModel } from '../../core/workflow/model/WorkflowModel';
import { config } from '../../config/config';
import { createLeanResult, stub } from '../../test/testUtils';
import { ExperimentModel } from '../experiments/models/ExperimentModel';
import { GraphStructureModel } from '../experiments/models/GraphStructureModel';
import { UploadedFileModel } from '../files/models/UploadedFileModel';
import { ComputationQueue } from './classes/ComputationQueue';
import { CloudComputationWorker } from './services/CloudComputationWorker';
import { LocalBackendComputationWorker } from './services/LocalBackendComputationWorker';
import { OptimizationRunner } from './services/OptimizationRunner';

const setEnv = (t: any, key: string, value?: string) => {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  t.after(() => {
    if (original === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = original;
  });
};

const useFakeDocker = (t: any) => {
  const dir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-fake-docker-'));
  const dockerPath = path.join(dir, 'docker');
  const callsFile = path.join(dir, 'calls.log');
  const stdinFile = path.join(dir, 'stdin.log');

  fs.writeFileSync(
    dockerPath,
    `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_DOCKER_CALLS_FILE"
case "$1" in
  run)
    if [ -n "$FAKE_DOCKER_RUN_SLEEP" ]; then
      sleep "$FAKE_DOCKER_RUN_SLEEP"
    fi
    if [ -n "$FAKE_DOCKER_CAPTURE_STDIN_FILE" ]; then
      cat > "$FAKE_DOCKER_CAPTURE_STDIN_FILE"
    else
      cat > /dev/null
    fi
    if [ -n "$FAKE_DOCKER_RUN_STDOUT" ]; then
      printf '%s\\n' "$FAKE_DOCKER_RUN_STDOUT"
    fi
    if [ -n "$FAKE_DOCKER_RUN_STDERR" ]; then
      printf '%s\\n' "$FAKE_DOCKER_RUN_STDERR" >&2
    fi
    exit "\${FAKE_DOCKER_RUN_EXIT:-0}"
    ;;
  image)
    if [ -n "$FAKE_DOCKER_INSPECT_STDERR" ]; then
      printf '%s\\n' "$FAKE_DOCKER_INSPECT_STDERR" >&2
    fi
    exit "\${FAKE_DOCKER_INSPECT_EXIT:-0}"
    ;;
  build)
    if [ -n "$FAKE_DOCKER_BUILD_STDOUT" ]; then
      printf '%s\\n' "$FAKE_DOCKER_BUILD_STDOUT"
    fi
    if [ -n "$FAKE_DOCKER_BUILD_STDERR" ]; then
      printf '%s\\n' "$FAKE_DOCKER_BUILD_STDERR" >&2
    fi
    exit "\${FAKE_DOCKER_BUILD_EXIT:-0}"
    ;;
  *)
    exit 0
    ;;
esac
`,
    { mode: 0o755 }
  );

  const originalPath = process.env.PATH || '';
  process.env.PATH = `${dir}:${originalPath}`;
  setEnv(t, 'FAKE_DOCKER_CALLS_FILE', callsFile);
  setEnv(t, 'FAKE_DOCKER_CAPTURE_STDIN_FILE', stdinFile);
  t.after(() => {
    process.env.PATH = originalPath;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  return {
    readCalls() {
      if (!fs.existsSync(callsFile)) return [];
      return fs
        .readFileSync(callsFile, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    },
    readStdin() {
      return fs.existsSync(stdinFile) ? fs.readFileSync(stdinFile, 'utf8') : '';
    },
  };
};

test('OptimizationRunner.run covers success, failure, timeout and missing docker binary', async (t) => {
  const runner = new OptimizationRunner();
  const docker = useFakeDocker(t);
  const originalGraphqlUrl = config.backend.graphqlUrl;
  const originalToken = config.backend.serviceToken;
  const originalPath = process.env.PATH || '';

  t.after(() => {
    config.backend.graphqlUrl = originalGraphqlUrl;
    config.backend.serviceToken = originalToken;
    process.env.PATH = originalPath;
  });

  config.backend.graphqlUrl = 'http://localhost:4000/graphql';
  config.backend.serviceToken = 'service-token';
  setEnv(t, 'OPTIMIZATION_DOCKER_IMAGE', 'custom-optimization-image');

  await runner.run({ experimentId: 'exp-1', hyperOptimizationMinutesPerPipeline: 7 });
  assert.equal(
    docker.readCalls()[0],
    'run --rm -i --add-host host.docker.internal:host-gateway custom-optimization-image python -u src/aws_jobs/optimization_handler/optimization_handler.py --env OPTIMIZATION_PAYLOAD_JSON={"experimentId":"exp-1","backend_url":"http://localhost:4000/graphql","backend_token":"service-token","hyper_optimization_minutes_per_pipeline":7}'
  );
  assert.equal(
    docker.readStdin(),
    JSON.stringify({
      experimentId: 'exp-1',
      backend_url: 'http://localhost:4000/graphql',
      backend_token: 'service-token',
      hyper_optimization_minutes_per_pipeline: 7,
    })
  );

  process.env.FAKE_DOCKER_RUN_STDERR = 'docker failed';
  process.env.FAKE_DOCKER_RUN_EXIT = '3';
  await assert.rejects(() => runner.run({ experimentId: 'exp-2' }), /docker failed/);

  delete process.env.FAKE_DOCKER_RUN_STDERR;
  process.env.FAKE_DOCKER_RUN_EXIT = '0';
  process.env.FAKE_DOCKER_RUN_SLEEP = '2';
  await assert.rejects(
    () => runner.run({ experimentId: 'exp-3', timeoutSeconds: 1 }),
    /Оптимізація перевищила ліміт часу/
  );

  delete process.env.FAKE_DOCKER_RUN_SLEEP;
  process.env.PATH = path.join(process.cwd(), 'missing-docker-path');
  stub(t, console as unknown as Record<string, unknown>, 'error', () => undefined);
  await assert.rejects(() => runner.run({ experimentId: 'exp-4' }), /ENOENT/);
});

test('LocalBackendComputationWorker covers start, stop and docker helper branches', async (t) => {
  const worker = new LocalBackendComputationWorker() as any;
  const docker = useFakeDocker(t);
  const awsJobsDir = fs.mkdtempSync(path.join(process.cwd(), 'tmp-aws-jobs-'));
  const originalGraphqlUrl = config.backend.graphqlUrl;
  const originalServiceToken = config.backend.serviceToken;

  fs.writeFileSync(path.join(awsJobsDir, 'Dockerfile'), 'FROM scratch\n');
  t.after(() => {
    config.backend.graphqlUrl = originalGraphqlUrl;
    config.backend.serviceToken = originalServiceToken;
    fs.rmSync(awsJobsDir, { recursive: true, force: true });
  });

  config.backend.graphqlUrl = 'http://localhost:4000/graphql';
  config.backend.serviceToken = 'token-1';
  setEnv(t, 'AWS_JOBS_DIR', awsJobsDir);
  stub(t, os as unknown as Record<string, unknown>, 'platform', () => 'linux');
  stub(t, console as unknown as Record<string, unknown>, 'log', () => undefined);
  stub(t, console as unknown as Record<string, unknown>, 'warn', () => undefined);

  const startWorker = new LocalBackendComputationWorker() as any;
  let startCalls = 0;
  startWorker.running = true;
  stub(t, startWorker, 'loop', async () => {
    startCalls += 1;
  });
  startWorker.start();
  startWorker.activeControllers.set('run-1', new AbortController());
  startWorker.stop();
  assert.equal(startCalls, 0);
  assert.equal(startWorker.activeControllers.get('run-1')?.signal.aborted, true);

  await worker.runComputeContainer('run-1');
  assert.equal(
    docker.readCalls()[0],
    'run --rm -i --env COMPUTE_PAYLOAD_JSON={"pipelineId":"run-1"} --env COMPUTE_BACKEND_URL=http://host.docker.internal:4000/graphql --env COMPUTE_BACKEND_TOKEN=token-1 --add-host host.docker.internal:host-gateway aws-jobs'
  );

  assert.equal(await worker.dockerImageExists(), true);
  await worker.runDockerCommand(['build', '-t', 'aws-jobs', awsJobsDir]);

  process.env.FAKE_DOCKER_INSPECT_EXIT = '1';
  delete worker.imageReadyPromise;
  await worker.ensureDockerImageReady();
  assert.equal(
    docker.readCalls().some((line) => line === `build -t aws-jobs ${awsJobsDir}`),
    true
  );

  const missingDirWorker = new LocalBackendComputationWorker() as any;
  process.env.FAKE_DOCKER_INSPECT_EXIT = '1';
  stub(t, missingDirWorker, 'resolveAwsJobsDir', () => null);
  await assert.rejects(
    () => missingDirWorker.ensureDockerImageReady(),
    /aws-jobs directory was not found/
  );

  process.env.FAKE_DOCKER_RUN_STDERR = 'local docker failed';
  process.env.FAKE_DOCKER_RUN_EXIT = '2';
  await assert.rejects(() => worker.runComputeContainer('run-2'), /local docker failed/);

  delete process.env.FAKE_DOCKER_RUN_STDERR;
  process.env.FAKE_DOCKER_RUN_EXIT = '0';
  process.env.FAKE_DOCKER_BUILD_STDERR = 'build failed';
  process.env.FAKE_DOCKER_BUILD_EXIT = '4';
  await assert.rejects(
    () => worker.runDockerCommand(['build', '-t', 'aws-jobs', awsJobsDir]),
    /build failed/
  );

  delete process.env.FAKE_DOCKER_BUILD_STDERR;
  delete process.env.FAKE_DOCKER_BUILD_EXIT;
  process.env.FAKE_DOCKER_RUN_SLEEP = '2';
  const controller = new AbortController();
  controller.abort();
  await worker.runComputeContainer('run-3', controller.signal);
});

test('LocalBackendComputationWorker covers loop, watcher, recovery and workflow branches', async (t) => {
  const calls: any[] = [];
  stub(t, console as unknown as Record<string, unknown>, 'warn', (...args: any[]) => {
    calls.push(['warn', ...args]);
  });

  const setupFailureWorker = new LocalBackendComputationWorker() as any;
  setupFailureWorker.pollMs = 0;
  stub(t, setupFailureWorker, 'ensureDockerImageReady', async () => {
    throw new Error('no image');
  });
  await setupFailureWorker.loop();
  assert.equal(setupFailureWorker.running, false);

  const claimFailureWorker = new LocalBackendComputationWorker() as any;
  claimFailureWorker.pollMs = 0;
  stub(t, claimFailureWorker, 'ensureDockerImageReady', async () => undefined);
  stub(t, claimFailureWorker, 'manager', {
    claimNextRun: async () => {
      claimFailureWorker.stopping = true;
      throw new Error('claim failed');
    },
  } as any);
  await claimFailureWorker.loop();

  const runWorker = new LocalBackendComputationWorker() as any;
  runWorker.pollMs = 0;
  let firstClaim = true;
  stub(t, runWorker, 'ensureDockerImageReady', async () => undefined);
  stub(t, runWorker, 'processRun', async (...args: any[]) => {
    calls.push(['processRun', ...args]);
    runWorker.stopping = true;
  });
  stub(t, runWorker, 'manager', {
    claimNextRun: async () => {
      if (!firstClaim) return null;
      firstClaim = false;
      return { _id: new Types.ObjectId() };
    },
  } as any);
  await runWorker.loop();

  const errorWorker = new LocalBackendComputationWorker() as any;
  stub(t, errorWorker, 'runComputeContainer', async () => {
    throw 'boom';
  });
  stub(t, errorWorker, 'startStatusWatcher', () => () => undefined);
  stub(t, errorWorker, 'manager', {
    failRun: async (...args: any[]) => {
      calls.push(['errorFailRun', ...args]);
    },
  } as any);
  await errorWorker.processRun('run-error');

  const abortedWorker = new LocalBackendComputationWorker() as any;
  abortedWorker.stopping = true;
  stub(t, abortedWorker, 'runComputeContainer', async () => undefined);
  stub(t, abortedWorker, 'startStatusWatcher', (_runId: string, controller: AbortController) => {
    controller.abort();
    return () => undefined;
  });
  stub(t, abortedWorker, 'getWorkflow', async () => ({ status: PipelineStatus.running }));
  stub(t, abortedWorker, 'manager', {
    failRun: async (...args: any[]) => {
      calls.push(['abortedFailRun', ...args]);
    },
  } as any);
  await abortedWorker.processRun('run-aborted');

  const watcherWorker = new LocalBackendComputationWorker() as any;
  watcherWorker.pollMs = 0;
  stub(t, watcherWorker, 'getWorkflow', async () => null);
  const controller = new AbortController();
  watcherWorker.startStatusWatcher('run-watch', controller);
  await wait(10);

  const successWorker = new LocalBackendComputationWorker() as any;
  stub(t, successWorker, 'workflowManager', {
    getWorkflow: async () => ({ status: PipelineStatus.completed }),
  } as any);
  assert.deepEqual(await successWorker.getWorkflow('run-1'), { status: PipelineStatus.completed });

  assert.equal(controller.signal.aborted, true);
  assert.equal(
    calls.some((entry) => entry[0] === 'processRun'),
    true
  );
  assert.deepEqual(calls.find((entry) => entry[0] === 'errorFailRun')?.[1], {
    runId: 'run-error',
    statusMessage: 'Локальне обчислення завершилось з помилкою',
  });
  assert.deepEqual(calls.find((entry) => entry[0] === 'abortedFailRun')?.[1], {
    runId: 'run-aborted',
    statusMessage: 'Локальний backend-воркер зупинено.',
  });
});

test('LocalBackendComputationWorker covers lifecycle, signal and fallback branches', async (t) => {
  const calls: any[] = [];
  const docker = useFakeDocker(t);
  const originalGraphqlUrl = config.backend.graphqlUrl;
  const originalPath = process.env.PATH || '';
  const originalAwsJobsDir = process.env.AWS_JOBS_DIR;

  t.after(() => {
    config.backend.graphqlUrl = originalGraphqlUrl;
    process.env.PATH = originalPath;
    if (originalAwsJobsDir === undefined) {
      delete process.env.AWS_JOBS_DIR;
      return;
    }
    process.env.AWS_JOBS_DIR = originalAwsJobsDir;
  });

  config.backend.graphqlUrl = 'http://localhost:4000/graphql';
  stub(t, console as unknown as Record<string, unknown>, 'log', (...args: any[]) => {
    calls.push(['log', ...args]);
  });
  stub(t, console as unknown as Record<string, unknown>, 'warn', (...args: any[]) => {
    calls.push(['warn', ...args]);
  });

  const startWorker = new LocalBackendComputationWorker() as any;
  let loopCalls = 0;
  stub(t, startWorker, 'loop', async () => {
    loopCalls += 1;
  });
  startWorker.start();
  assert.equal(loopCalls, 1);

  const watcherWorker = new LocalBackendComputationWorker() as any;
  watcherWorker.stopping = true;
  const watcherController = new AbortController();
  const stopWatcher = watcherWorker.startStatusWatcher('run-stop', watcherController);
  await wait(10);
  stopWatcher();
  assert.equal(watcherController.signal.aborted, true);

  process.env.FAKE_DOCKER_RUN_STDOUT = 'local worker output';
  const outputWorker = new LocalBackendComputationWorker() as any;
  await outputWorker.runComputeContainer('run-output');
  assert.equal(
    calls.some(
      (entry) =>
        entry[0] === 'log' &&
        String(entry[1]).includes('[local-backend-worker][run-output] local worker output')
    ),
    true
  );

  process.env.FAKE_DOCKER_RUN_SLEEP = '2';
  const signalWorker = new LocalBackendComputationWorker() as any;
  const signalController = new AbortController();
  const signalPromise = signalWorker.runComputeContainer('run-signal', signalController.signal);
  setTimeout(() => signalController.abort(), 50);
  await signalPromise;
  delete process.env.FAKE_DOCKER_RUN_STDOUT;
  delete process.env.FAKE_DOCKER_RUN_SLEEP;

  const abortedErrorWorker = new LocalBackendComputationWorker() as any;
  abortedErrorWorker.stopping = true;
  stub(
    t,
    abortedErrorWorker,
    'startStatusWatcher',
    (_runId: string, controller: AbortController) => {
      controller.abort();
      return () => undefined;
    }
  );
  stub(t, abortedErrorWorker, 'runComputeContainer', async () => {
    throw new Error('docker aborted');
  });
  stub(t, abortedErrorWorker, 'getWorkflow', async () => ({ status: PipelineStatus.running }));
  stub(t, abortedErrorWorker, 'manager', {
    failRun: async (...args: any[]) => {
      calls.push(['failRun', ...args]);
    },
  } as any);
  await abortedErrorWorker.processRun('run-catch-aborted');
  assert.equal(
    calls.some(
      (entry) =>
        entry[0] === 'failRun' &&
        entry[1].runId === 'run-catch-aborted' &&
        entry[1].statusMessage === 'Локальний backend-воркер зупинено.'
    ),
    true
  );

  const errorWorker = new LocalBackendComputationWorker() as any;
  process.env.PATH = path.join(process.cwd(), 'missing-docker-worker');
  await assert.rejects(() => errorWorker.runComputeContainer('run-missing'), /ENOENT/);
  process.env.PATH = originalPath;

  const fallbackWorker = new LocalBackendComputationWorker() as any;
  delete process.env.AWS_JOBS_DIR;
  const expectedFallback = path.resolve(process.cwd(), 'aws-jobs');
  stub(
    t,
    fs as unknown as Record<string, unknown>,
    'existsSync',
    (candidate: string) => candidate === path.join(expectedFallback, 'Dockerfile')
  );
  assert.equal(fallbackWorker.resolveAwsJobsDir(), expectedFallback);
});

test('CloudComputationWorker covers start and loop branches', async (t) => {
  const calls: any[] = [];
  stub(t, console as unknown as Record<string, unknown>, 'warn', (...args: any[]) => {
    calls.push(['warn', ...args]);
  });

  const disabledWorker = new CloudComputationWorker() as any;
  disabledWorker.jobQueue = '';
  disabledWorker.jobDefinition = '';
  disabledWorker.resultsBucket = '';
  disabledWorker.start();
  assert.equal(calls[0][0], 'warn');

  const runningWorker = new CloudComputationWorker() as any;
  runningWorker.running = true;
  stub(t, runningWorker, 'loop', async () => {
    calls.push(['loop']);
  });
  runningWorker.start();
  assert.equal(
    calls.some((entry) => entry[0] === 'loop'),
    false
  );

  const loopWorker = new CloudComputationWorker() as any;
  loopWorker.pollMs = 0;
  stub(t, loopWorker, 'reconcileRuns', async () => {
    throw new Error('sync failed');
  });
  stub(t, loopWorker, 'submitRun', async () => {
    loopWorker.stopping = true;
    throw new Error('submit failed');
  });
  stub(t, loopWorker, 'manager', {
    claimNextRun: async () => ({ _id: new Types.ObjectId() }),
    failRun: async (...args: any[]) => {
      calls.push(['failRun', ...args]);
    },
  } as any);
  await loopWorker.loop();

  const claimErrorWorker = new CloudComputationWorker() as any;
  claimErrorWorker.pollMs = 0;
  stub(t, claimErrorWorker, 'reconcileRuns', async () => undefined);
  stub(t, claimErrorWorker, 'manager', {
    claimNextRun: async () => {
      claimErrorWorker.stopping = true;
      throw new Error('claim failed');
    },
  } as any);
  await claimErrorWorker.loop();

  assert.equal(
    calls.some((entry) => entry[0] === 'failRun'),
    true
  );
});

test('CloudComputationWorker covers configured defaults and lifecycle toggles', async (t) => {
  const originalConfig = {
    batchJobQueue: config.aws.batchJobQueue,
    batchJobDefinition: config.aws.batchJobDefinition,
    batchJobNamePrefix: config.aws.batchJobNamePrefix,
    region: config.aws.region,
    resultsBucket: config.aws.resultsBucket,
    resultsPrefix: config.aws.resultsPrefix,
    resultsRegion: config.aws.resultsRegion,
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
    bucket: config.s3.bucket,
  };

  t.after(() => {
    config.aws.batchJobQueue = originalConfig.batchJobQueue;
    config.aws.batchJobDefinition = originalConfig.batchJobDefinition;
    config.aws.batchJobNamePrefix = originalConfig.batchJobNamePrefix;
    config.aws.region = originalConfig.region;
    config.aws.resultsBucket = originalConfig.resultsBucket;
    config.aws.resultsPrefix = originalConfig.resultsPrefix;
    config.aws.resultsRegion = originalConfig.resultsRegion;
    config.aws.accessKeyId = originalConfig.accessKeyId;
    config.aws.secretAccessKey = originalConfig.secretAccessKey;
    config.s3.bucket = originalConfig.bucket;
  });

  config.aws.batchJobQueue = 'queue';
  config.aws.batchJobDefinition = 'definition';
  config.aws.batchJobNamePrefix = '';
  config.aws.region = 'eu-central-1';
  config.aws.resultsBucket = '';
  config.aws.resultsPrefix = '/results/';
  config.aws.resultsRegion = '';
  config.aws.accessKeyId = 'key';
  config.aws.secretAccessKey = 'secret';
  config.s3.bucket = 'bucket';

  const worker = new CloudComputationWorker() as any;
  assert.equal(worker.jobNamePrefix, 'experiment-run');
  assert.equal(worker.resultsBucket, 'bucket');
  assert.equal(worker.resultsPrefix, 'results');

  let loopCalls = 0;
  stub(t, worker, 'loop', async () => {
    loopCalls += 1;
  });
  worker.start();
  worker.stop();

  assert.equal(loopCalls, 1);
  assert.equal(worker.stopping, true);
});

test('CloudComputationWorker covers payload, fetch, reconcile and submit branches', async (t) => {
  const worker = new CloudComputationWorker() as any;
  const runId = new Types.ObjectId().toHexString();
  const experimentId = new Types.ObjectId();
  const pipelineId = new Types.ObjectId();
  const fileId = new Types.ObjectId();
  const nodeId = new Types.ObjectId();
  const calls: any[] = [];

  worker.inputBucket = 'input-bucket';
  worker.resultsBucket = 'results-bucket';
  worker.resultsPrefix = 'prefix';
  worker.jobQueue = 'queue';
  worker.jobDefinition = 'definition';
  worker.jobNamePrefix = 'job';

  assert.throws(
    () => worker.buildPayload(runId, experimentId, undefined, undefined, [], [nodeId]),
    /Graph path nodes are missing/
  );

  const payload = worker.buildPayload(
    runId,
    experimentId,
    undefined,
    undefined,
    [{ _id: nodeId, stage: 'CLASSIFICATION', technology: 'SVM', settings: [] }],
    [nodeId]
  );
  assert.equal('file_s3_bucket' in payload, false);

  stub(t, worker, 's3', {
    send: async () => ({
      Body: Readable.from([JSON.stringify({ status: 'completed', result: { score: 2 } })]),
    }),
  });
  assert.deepEqual(await worker.fetchResultPayload(runId), {
    status: 'completed',
    result: { score: 2 },
  });

  stub(t, worker, 's3', {
    send: async () => {
      throw { name: 'NoSuchKey' };
    },
  });
  assert.equal(await worker.fetchResultPayload(runId), null);

  stub(t, worker, 's3', {
    send: async () => {
      throw { Code: 'NoSuchKey' };
    },
  });
  assert.equal(await worker.fetchResultPayload(runId), null);

  stub(t, worker, 's3', {
    send: async () => {
      throw new Error('s3 failed');
    },
  });
  await assert.rejects(() => worker.fetchResultPayload(runId), /s3 failed/);

  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'aggregate', async () => [
    { pipeline: {} },
    { pipeline: { _id: new Types.ObjectId() } },
    { pipeline: { _id: pipelineId } },
  ]);
  let fetchCalls = 0;
  stub(t, worker, 'fetchResultPayload', async () => {
    fetchCalls += 1;
    if (fetchCalls === 1) return null;
    return { status: 'completed', result: { score: 3 } };
  });
  stub(t, worker, 'manager', {
    failRun: async (...args: any[]) => {
      calls.push(['failRun', ...args]);
    },
    completeRun: async (...args: any[]) => {
      calls.push(['completeRun', ...args]);
    },
  } as any);
  await worker.reconcileRuns();
  assert.deepEqual(calls.find((entry) => entry[0] === 'completeRun')?.[1], {
    runId: pipelineId.toHexString(),
    resultJson: JSON.stringify({ score: 3 }),
    statusMessage: 'Виконано в AWS',
  });

  await assert.rejects(() => worker.submitRun('bad-id'), /Invalid run id/);

  const basePipeline = { _id: pipelineId, experimentId, pathNodeIds: [nodeId] };
  let workflowStatus = PipelineStatus.idle;
  let experimentDoc: any = null;
  let graphDoc: any = { nodes: [] };
  let fileDoc: any = null;
  let batchResponse: any = {};

  stub(
    t,
    PipelineBaseService as unknown as Record<string, unknown>,
    'getById',
    async () => basePipeline
  );
  stub(t, worker, 'workflowManager', {
    getWorkflow: async () => ({ status: workflowStatus }),
  } as any);
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(experimentDoc)
  );
  stub(t, GraphStructureModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult(graphDoc)
  );
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findById', () =>
    createLeanResult(fileDoc)
  );
  stub(t, worker, 'batch', {
    send: async (command: any) => {
      calls.push(['batch', command.input]);
      return batchResponse;
    },
  } as any);
  stub(
    t,
    PipelineModel as unknown as Record<string, unknown>,
    'findOneAndUpdate',
    (...args: any[]) => {
      calls.push(['findOneAndUpdate', ...args]);
      return createLeanResult({});
    }
  );

  await worker.submitRun(runId);
  assert.equal(
    calls.some((entry) => entry[0] === 'batch'),
    false
  );

  workflowStatus = PipelineStatus.running;
  await assert.rejects(() => worker.submitRun(runId), /Experiment not found/);

  experimentDoc = { _id: experimentId, fileId };
  await assert.rejects(() => worker.submitRun(runId), /Experiment graph is empty/);

  graphDoc = {
    nodes: [{ _id: nodeId, stage: 'CLASSIFICATION', technology: 'SVM', settings: [] }],
  };
  await assert.rejects(() => worker.submitRun(runId), /Experiment file not found/);

  fileDoc = { storageKey: 'uploads/file.csv' };
  worker.inputBucket = '';
  await assert.rejects(() => worker.submitRun(runId), /S3 bucket is not configured/);

  worker.inputBucket = 'input-bucket';
  experimentDoc = { _id: experimentId, fileId: undefined };
  batchResponse = {};
  await worker.submitRun(runId);
  assert.equal(
    calls.some((entry) => entry[0] === 'batch' && entry[1].jobName === `job-${runId}`),
    true
  );
  assert.equal(
    calls.some(
      (entry) =>
        entry[0] === 'findOneAndUpdate' && entry[2]?.$set?.statusMessage === 'Відправлено в AWS'
    ),
    true
  );
});
