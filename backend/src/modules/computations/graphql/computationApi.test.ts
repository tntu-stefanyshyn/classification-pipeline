import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { buildGraphqlSchema, executeGraphql, toPlainValue } from '../../../test/graphqlTestUtils';
import { stub } from '../../../test/testUtils';
import { ComputationManager } from '../services/ComputationManager';
import { ComputationResolver } from './computation';

test('Computation GraphQL executes optimization and run lifecycle mutations', async (t) => {
  const schema = buildGraphqlSchema([ComputationResolver]);
  const experimentId = new Types.ObjectId().toHexString();
  const runId = new Types.ObjectId().toHexString();
  const calls: any[] = [];

  stub(
    t,
    ComputationManager.prototype as unknown as Record<string, unknown>,
    'optimize',
    async (...args: any[]) => {
      calls.push(['optimize', ...args]);
      return { runId, pathNodeIds: ['node-1', 'node-2'], score: 0.93 };
    }
  );
  stub(
    t,
    ComputationManager.prototype as unknown as Record<string, unknown>,
    'enqueueRuns',
    async (...args: any[]) => {
      calls.push(['enqueueRuns', ...args]);
      return true;
    }
  );
  stub(
    t,
    ComputationManager.prototype as unknown as Record<string, unknown>,
    'stopRun',
    async (...args: any[]) => {
      calls.push(['stopRun', ...args]);
      return { _id: runId, queue: 'local' };
    }
  );
  stub(
    t,
    ComputationManager.prototype as unknown as Record<string, unknown>,
    'claimNextRun',
    async (...args: any[]) => {
      calls.push(['claimNextRun', ...args]);
      return {
        _id: runId,
        queue: 'local',
        machineInfo: { hostname: 'node-1' },
      };
    }
  );
  stub(
    t,
    ComputationManager.prototype as unknown as Record<string, unknown>,
    'pauseExperimentRuns',
    async (...args: any[]) => {
      calls.push(['pauseExperimentRuns', ...args]);
      return [{ _id: runId }];
    }
  );
  stub(
    t,
    ComputationManager.prototype as unknown as Record<string, unknown>,
    'resumeExperimentRuns',
    async (...args: any[]) => {
      calls.push(['resumeExperimentRuns', ...args]);
      return [{ _id: runId }];
    }
  );
  stub(
    t,
    ComputationManager.prototype as unknown as Record<string, unknown>,
    'completePipeline',
    async (...args: any[]) => {
      calls.push(['completePipeline', ...args]);
      return true;
    }
  );

  const optimizeResult = await executeGraphql(
    schema,
    `
      query Optimize($experimentId: ID!) {
        optimizeExperimentRuns(experimentId: $experimentId) {
          runId
          pathNodeIds
          score
        }
      }
    `,
    {
      variables: { experimentId },
    }
  );
  const mutationResult = await executeGraphql(
    schema,
    `
      mutation Computations(
        $enqueue: EnqueueExperimentRunsInput!
        $stop: StopExperimentRunInput!
        $queue: ComputationQueue!
        $machineInfo: PipelineMachineInfoInput
        $experimentId: ID!
        $complete: CompletePipelineInput!
      ) {
        enqueueExperimentRuns(input: $enqueue)
        stopExperimentRun(input: $stop) {
          _id
          queue
        }
        claimExperimentRun(queue: $queue, machineInfo: $machineInfo) {
          _id
          queue
          machineInfo {
            hostname
          }
        }
        pauseExperimentRuns(experimentId: $experimentId) {
          _id
        }
        resumeExperimentRuns(experimentId: $experimentId) {
          _id
        }
        completePipeline(input: $complete)
      }
    `,
    {
      variables: {
        enqueue: {
          experimentId,
          queue: 'local',
          runAll: true,
          rerun: false,
        },
        stop: { runId },
        queue: 'local',
        machineInfo: {
          hostname: 'node-1',
          platform: 'linux',
          cores: 8,
          memoryGb: 16,
        },
        experimentId,
        complete: {
          pipelineId: runId,
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
    }
  );

  assert.equal(optimizeResult.errors, undefined);
  assert.deepEqual(toPlainValue(optimizeResult.data), {
    optimizeExperimentRuns: {
      runId,
      pathNodeIds: ['node-1', 'node-2'],
      score: 0.93,
    },
  });
  assert.equal(mutationResult.errors, undefined);
  assert.deepEqual(toPlainValue(mutationResult.data), {
    enqueueExperimentRuns: true,
    stopExperimentRun: {
      _id: runId,
      queue: 'local',
    },
    claimExperimentRun: {
      _id: runId,
      queue: 'local',
      machineInfo: {
        hostname: 'node-1',
      },
    },
    pauseExperimentRuns: [{ _id: runId }],
    resumeExperimentRuns: [{ _id: runId }],
    completePipeline: true,
  });
  assert.deepEqual(toPlainValue(calls), [
    ['optimize', experimentId],
    ['enqueueRuns', { experimentId, queue: 'local', runAll: true, rerun: false }],
    ['stopRun', runId],
    [
      'claimNextRun',
      'local',
      {
        hostname: 'node-1',
        platform: 'linux',
        cores: 8,
        memoryGb: 16,
      },
    ],
    ['pauseExperimentRuns', experimentId],
    ['resumeExperimentRuns', experimentId],
    [
      'completePipeline',
      {
        pipelineId: runId,
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
    ],
  ]);
});
