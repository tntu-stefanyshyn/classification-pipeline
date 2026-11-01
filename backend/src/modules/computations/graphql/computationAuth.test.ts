import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import { config } from '../../../config/config';
import { PipelineBaseService } from '../../../core/pipeline';
import { PipelineResolver } from '../../../core/pipeline/graphql/pipeline';
import { PipelineManager } from '../../../core/pipeline/services/PipelineManager';
import { UserModel } from '../../../core/user';
import {
  buildGraphqlSchema,
  createGraphqlContext,
  executeGraphql,
} from '../../../test/graphqlTestUtils';
import { createLeanResult, stub } from '../../../test/testUtils';
import { Experiments } from '../../experiments/graphql/Experiments';
import { ExperimentModel } from '../../experiments/models/ExperimentModel';
import { ExperimentManager } from '../../experiments/services/ExperimentManager';
import { ComputationManager } from '../services/ComputationManager';
import { ComputationResolver } from './computation';

const SERVICE_TOKEN = 'svc-token-for-tests';
const EXPERIMENT_NOT_FOUND = /Експеремент не знайдено/;
const PIPELINE_NOT_FOUND = /Конвеєр не знайдено/;
const NOT_AUTHENTICATED = /Not authenticated/;

const ownerId = new Types.ObjectId().toHexString();
const strangerId = new Types.ObjectId().toHexString();
const experimentId = new Types.ObjectId().toHexString();
const pipelineId = new Types.ObjectId().toHexString();

const schema = buildGraphqlSchema([ComputationResolver, PipelineResolver, Experiments]);

const signToken = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret);

const credentials = () => ({
  none: undefined,
  stranger: signToken(strangerId),
  owner: signToken(ownerId),
  service: SERVICE_TOKEN,
});

type Credential = keyof ReturnType<typeof credentials>;

const stubBackend = (t: TestContext) => {
  const executed: string[] = [];
  const record =
    <T>(name: string, result: T) =>
    async () => {
      executed.push(name);
      return result;
    };
  const pipeline = { _id: pipelineId, experimentId };

  const original = config.backend.serviceToken;
  t.after(() => {
    config.backend.serviceToken = original;
  });
  config.backend.serviceToken = SERVICE_TOKEN;

  stub(t, UserModel as unknown as Record<string, unknown>, 'findById', async (id: string) => ({
    _id: new Types.ObjectId(id),
  }));
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'findOne', (query: any) =>
    createLeanResult(
      String(query._id) === experimentId && String(query.createdById) === ownerId
        ? { _id: experimentId, createdById: ownerId }
        : null
    )
  );
  stub(t, ExperimentModel as unknown as Record<string, unknown>, 'exists', async (query: any) =>
    String(query._id) === experimentId && String(query.createdById) === ownerId
      ? { _id: experimentId }
      : null
  );

  const pipelines = PipelineBaseService as unknown as Record<string, unknown>;
  stub(t, pipelines, 'getById', async (id: unknown) => {
    if (String(id) !== pipelineId) throw new Error('Конвеєр не знайдено');
    return pipeline;
  });
  stub(t, pipelines, 'listByExperiment', record('listByExperiment', [pipeline]));
  stub(t, pipelines, 'updatePipelineProgress', record('updatePipelineProgress', pipeline));
  stub(t, pipelines, 'updatePipelineOptimization', record('updatePipelineOptimization', pipeline));

  const manager = ComputationManager.prototype as unknown as Record<string, unknown>;
  stub(
    t,
    manager,
    'optimize',
    record('optimize', { runId: pipelineId, pathNodeIds: [], score: 0.5 })
  );
  stub(t, manager, 'enqueueRuns', record('enqueueRuns', undefined));
  stub(t, manager, 'stopRun', record('stopRun', pipeline));
  stub(t, manager, 'claimNextRun', record('claimNextRun', pipeline));
  stub(t, manager, 'pauseExperimentRuns', record('pauseExperimentRuns', [pipeline]));
  stub(t, manager, 'resumeExperimentRuns', record('resumeExperimentRuns', [pipeline]));
  stub(t, manager, 'completePipeline', record('completePipeline', undefined));

  const pipelineManager = PipelineManager.prototype as unknown as Record<string, unknown>;
  stub(t, pipelineManager, 'changeStatus', record('changeStatus', true));

  const experiments = ExperimentManager.prototype as unknown as Record<string, unknown>;
  stub(t, experiments, 'updateExperimentProgress', record('updateExperimentProgress', true));
  stub(
    t,
    experiments,
    'updateExperimentOptimizationResult',
    record('updateExperimentOptimizationResult', true)
  );

  return executed;
};

const run = (source: string, variables: Record<string, unknown>, token?: string) =>
  executeGraphql(schema, source, {
    variables,
    context: createGraphqlContext({
      req: { headers: token ? { authorization: `Bearer ${token}` } : {} } as any,
    }),
  });

type Expectation = true | RegExp;

const USER_ONLY = (notFound: RegExp): Record<Credential, Expectation> => ({
  none: NOT_AUTHENTICATED,
  stranger: notFound,
  owner: true,
  service: /jwt malformed/,
});

const WORKER_ONLY: Record<Credential, Expectation> = {
  none: NOT_AUTHENTICATED,
  stranger: NOT_AUTHENTICATED,
  owner: NOT_AUTHENTICATED,
  service: true,
};

const OWNER_OR_WORKER = (notFound: RegExp): Record<Credential, Expectation> => ({
  none: NOT_AUTHENTICATED,
  stranger: notFound,
  owner: true,
  service: true,
});

const operations: Array<{
  name: string;
  // The manager call behind the operation; `pipeline` only returns data, so its result is checked.
  executes?: string;
  source: string;
  variables: Record<string, unknown>;
  expected: Record<Credential, Expectation>;
}> = [
  {
    name: 'optimizeExperimentRuns',
    executes: 'optimize',
    source: 'query($id: ID!) { optimizeExperimentRuns(experimentId: $id) { runId } }',
    variables: { id: experimentId },
    expected: USER_ONLY(EXPERIMENT_NOT_FOUND),
  },
  {
    name: 'enqueueExperimentRuns',
    executes: 'enqueueRuns',
    source:
      'mutation($input: EnqueueExperimentRunsInput!) { enqueueExperimentRuns(input: $input) }',
    variables: { input: { experimentId, queue: 'local', runAll: true } },
    expected: USER_ONLY(EXPERIMENT_NOT_FOUND),
  },
  {
    name: 'stopExperimentRun',
    executes: 'stopRun',
    source:
      'mutation($input: StopExperimentRunInput!) { stopExperimentRun(input: $input) { _id } }',
    variables: { input: { runId: pipelineId } },
    expected: USER_ONLY(PIPELINE_NOT_FOUND),
  },
  {
    name: 'pauseExperimentRuns',
    executes: 'pauseExperimentRuns',
    source: 'mutation($id: ID!) { pauseExperimentRuns(experimentId: $id) { _id } }',
    variables: { id: experimentId },
    expected: USER_ONLY(EXPERIMENT_NOT_FOUND),
  },
  {
    name: 'resumeExperimentRuns',
    executes: 'resumeExperimentRuns',
    source: 'mutation($id: ID!) { resumeExperimentRuns(experimentId: $id) { _id } }',
    variables: { id: experimentId },
    expected: USER_ONLY(EXPERIMENT_NOT_FOUND),
  },
  {
    name: 'claimExperimentRun',
    executes: 'claimNextRun',
    source: 'mutation { claimExperimentRun(queue: local) { _id } }',
    variables: {},
    expected: WORKER_ONLY,
  },
  {
    name: 'completePipeline',
    executes: 'completePipeline',
    source: 'mutation($input: CompletePipelineInput!) { completePipeline(input: $input) }',
    variables: {
      input: {
        pipelineId,
        payload: {
          accuracyScores: [0.9],
          f1Scores: [0.8],
          rocAucScores: [0.95],
          optimizationIntermediateScores: [0.1],
          sampleCount: 12,
          duration: 5.5,
          confusionMatrixes: [
            [
              [1, 0],
              [0, 1],
            ],
          ],
          channelNames: ['A'],
          predictionSampleCounts: [12],
          predictionSampleCount: 12,
          predictionDataPercent: 20,
        },
      },
    },
    expected: WORKER_ONLY,
  },
  {
    name: 'updatePipelineProgress',
    executes: 'updatePipelineProgress',
    source:
      'mutation($input: UpdatePipelineProgressInput!) { updatePipelineProgress(input: $input) { _id } }',
    variables: { input: { pipelineId, progress: 10, message: 'Working' } },
    expected: WORKER_ONLY,
  },
  {
    name: 'updatePipelineOptimization',
    executes: 'updatePipelineOptimization',
    source:
      'mutation($input: UpdatePipelineOptimizationInput!) { updatePipelineOptimization(input: $input) }',
    variables: { input: { pipelineId, score: 0.5 } },
    expected: WORKER_ONLY,
  },
  {
    name: 'updateExperimentProgress',
    executes: 'updateExperimentProgress',
    source:
      'mutation($input: UpdateExperimentProgressInput!) { updateExperimentProgress(input: $input) }',
    variables: { input: { experimentId, progress: 10, message: 'Working' } },
    expected: WORKER_ONLY,
  },
  {
    name: 'updateExperimentOptimizationResult',
    executes: 'updateExperimentOptimizationResult',
    source:
      'mutation($input: UpdateExperimentOptimizationResultInput!) { updateExperimentOptimizationResult(input: $input) }',
    variables: { input: { experimentId, bestPipelineId: pipelineId, score: 0.5 } },
    expected: WORKER_ONLY,
  },
  {
    name: 'pipeline',
    source: 'query($id: ID!) { pipeline(pipelineId: $id) { _id } }',
    variables: { id: pipelineId },
    expected: OWNER_OR_WORKER(PIPELINE_NOT_FOUND),
  },
  {
    name: 'pipelines',
    executes: 'listByExperiment',
    source: 'query($id: ID!) { pipelines(experimentId: $id) { _id } }',
    variables: { id: experimentId },
    expected: OWNER_OR_WORKER(EXPERIMENT_NOT_FOUND),
  },
  {
    name: 'changePipelineStatus',
    executes: 'changeStatus',
    source: 'mutation($input: ChangePipelineStatusInput!) { changePipelineStatus(input: $input) }',
    variables: { input: { pipelineId, status: 'queued' } },
    expected: OWNER_OR_WORKER(PIPELINE_NOT_FOUND),
  },
];

for (const operation of operations) {
  test(`${operation.name} enforces the caller rules`, async (t) => {
    const executed = stubBackend(t);
    const tokens = credentials();

    for (const credential of Object.keys(tokens) as Credential[]) {
      executed.length = 0;
      const expected = operation.expected[credential];
      const result = await run(operation.source, operation.variables, tokens[credential]);

      if (expected === true) {
        assert.equal(result.errors, undefined, `${credential} should be accepted`);
        assert.ok(result.data?.[operation.name], `${credential} should get a result`);
        if (operation.executes) {
          assert.ok(executed.includes(operation.executes), `${credential} should execute`);
        }
      } else {
        assert.match(result.errors?.[0]?.message ?? '', expected, `${credential} message`);
        assert.equal(executed.length, 0, `${credential} must not execute`);
      }
    }
  });
}

test('a pipeline of another user looks the same as a missing one', async (t) => {
  stubBackend(t);
  const source = 'query($id: ID!) { pipeline(pipelineId: $id) { _id } }';
  const { stranger } = credentials();

  const foreign = await run(source, { id: pipelineId }, stranger);
  const missing = await run(source, { id: new Types.ObjectId().toHexString() }, stranger);

  assert.equal(foreign.errors?.[0]?.message, missing.errors?.[0]?.message);
});

test('an expired user token is rejected', async (t) => {
  const executed = stubBackend(t);
  const expired = jwt.sign({ sub: ownerId }, config.jwtSecret, { expiresIn: -10 });

  const result = await run(
    'mutation($id: ID!) { pauseExperimentRuns(experimentId: $id) { _id } }',
    { id: experimentId },
    expired
  );

  assert.match(result.errors?.[0]?.message ?? '', /jwt expired/);
  assert.deepEqual(executed, []);
});

test('worker operations stay closed when no service token is configured', async (t) => {
  const executed = stubBackend(t);
  config.backend.serviceToken = '';

  for (const token of [undefined, ' ', SERVICE_TOKEN]) {
    const result = await run('mutation { claimExperimentRun(queue: local) { _id } }', {}, token);
    assert.match(result.errors?.[0]?.message ?? '', NOT_AUTHENTICATED);
  }
  assert.deepEqual(executed, []);
});
