import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import {
  buildGraphqlSchema,
  createGraphqlContext,
  executeGraphql,
  toPlainValue,
} from '../../../test/graphqlTestUtils';
import { stub } from '../../../test/testUtils';
import { AuthFlow } from '../../auth/services/AuthFlow';
import { ExperimentStatus } from '../classes/ExperimentStatus';
import { OptimizationStatus } from '../classes/OptimizationStatus';
import { ExperimentManager } from '../services/ExperimentManager';
import { GraphManager } from '../services/GraphManager';
import { Experiments } from './Experiments';
import { WorkflowModel } from '../../../core/workflow/model/WorkflowModel';
import { WorkflowType } from '../../../core/workflow/enums';

const createWorkflowQueryResult = (status: ExperimentStatus) => ({
  sort: (sortBy: unknown) => ({
    lean: async () => ({ status, sortBy }),
  }),
});

test('Experiments GraphQL executes queries and field resolvers through the schema', async (t) => {
  const userId = new Types.ObjectId();
  const experimentId = new Types.ObjectId();
  const graphId = new Types.ObjectId();
  const calls: any[] = [];
  const experiment = {
    _id: experimentId,
    name: 'Experiment 1',
    description: 'Description',
  };

  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => ({
    _id: userId,
    email: 'tester@example.com',
  }));
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'list',
    async (...args: any[]) => {
      calls.push(['list', ...args]);
      return [experiment];
    }
  );
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'getById',
    async (...args: any[]) => {
      calls.push(['getById', ...args]);
      return experiment;
    }
  );
  stub(
    t,
    GraphManager.prototype as unknown as Record<string, unknown>,
    'getByExperimentId',
    async (...args: any[]) => {
      calls.push(['getByExperimentId', ...args]);
      return {
        _id: graphId,
        experimentId,
        computationMode: 'both',
        settings: { folds: 5 },
      };
    }
  );
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', (...args: any[]) => {
    calls.push(['findOneWorkflow', ...args]);
    return createWorkflowQueryResult(ExperimentStatus.completed);
  });
  const schema = buildGraphqlSchema([Experiments]);

  const result = await executeGraphql(
    schema,
    `
      query Experiments($id: ID!) {
        experiments {
          _id
          name
          graph {
            _id
            experimentId
            computationMode
            settings {
              folds
            }
          }
          status
        }
        experiment(_id: $id) {
          _id
          name
          description
        }
      }
    `,
    {
      variables: { id: experimentId.toHexString() },
      context: createGraphqlContext({ req: { headers: { authorization: 'Bearer token' } } as any }),
    }
  );

  assert.equal(result.errors, undefined);
  assert.deepEqual(toPlainValue(result.data), {
    experiments: [
      {
        _id: experimentId.toHexString(),
        name: 'Experiment 1',
        graph: {
          _id: graphId.toHexString(),
          experimentId: experimentId.toHexString(),
          computationMode: 'both',
          settings: {
            folds: 5,
          },
        },
        status: 'completed',
      },
    ],
    experiment: {
      _id: experimentId.toHexString(),
      name: 'Experiment 1',
      description: 'Description',
    },
  });
  assert.equal(
    calls.some((entry) => entry[0] === 'list' && entry[1] === userId.toHexString()),
    true
  );
  assert.equal(
    calls.some((entry) => entry[0] === 'getById' && entry[1] === experimentId.toHexString()),
    true
  );
  assert.equal(
    calls.some(
      (entry) => entry[0] === 'getByExperimentId' && String(entry[1]) === experimentId.toHexString()
    ),
    true
  );
  assert.equal(
    calls.some(
      (entry) =>
        entry[0] === 'findOneWorkflow' &&
        String(entry[1]?.instanceId) === experimentId.toHexString() &&
        entry[1]?.type === WorkflowType.EXPERIMENT
    ),
    true
  );
});

test('Experiments GraphQL executes mutations through the schema', async (t) => {
  const userId = new Types.ObjectId();
  const experimentId = new Types.ObjectId().toHexString();
  const fileId = new Types.ObjectId().toHexString();
  const pipelineId = new Types.ObjectId().toHexString();
  const technologyId = new Types.ObjectId().toHexString();
  const calls: any[] = [];

  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => ({
    _id: userId,
    email: 'tester@example.com',
  }));
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'create',
    async (...args: any[]) => {
      calls.push(['create', ...args]);
      return { _id: experimentId, name: 'Created Experiment' };
    }
  );
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'update',
    async (...args: any[]) => {
      calls.push(['update', ...args]);
      return { _id: experimentId, name: 'Updated Experiment', description: 'Updated description' };
    }
  );
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'generateGraph',
    async (...args: any[]) => {
      calls.push(['generateGraph', ...args]);
      return { _id: experimentId, name: 'Updated Experiment' };
    }
  );
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'getById',
    async (...args: any[]) => {
      calls.push(['getById', ...args]);
      return { _id: experimentId, name: 'Updated Experiment' };
    }
  );
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'changeStatus',
    async (...args: any[]) => {
      calls.push(['changeStatus', ...args]);
      return true;
    }
  );
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'updateExperimentProgress',
    async (...args: any[]) => {
      calls.push(['updateExperimentProgress', ...args]);
      return true;
    }
  );
  stub(
    t,
    ExperimentManager.prototype as unknown as Record<string, unknown>,
    'updateExperimentOptimizationResult',
    async (...args: any[]) => {
      calls.push(['updateExperimentOptimizationResult', ...args]);
      return true;
    }
  );
  stub(t, WorkflowModel as unknown as Record<string, unknown>, 'findOne', (...args: any[]) => {
    calls.push(['findOneWorkflow', ...args]);
    return createWorkflowQueryResult(ExperimentStatus.completed);
  });
  const schema = buildGraphqlSchema([Experiments]);

  const result = await executeGraphql(
    schema,
    `
      mutation Experiments(
        $create: CreateExperimentInput!
        $update: UpdateExperimentInput!
        $graph: GenerateExperimentGraphInput!
        $status: ChangeExperimentStatusInput!
        $progress: UpdateExperimentProgressInput!
        $optimization: UpdateExperimentOptimizationResultInput!
      ) {
        createExperiment(input: $create) {
          _id
          name
        }
        updateExperiment(input: $update) {
          _id
          name
          description
        }
        generateExperimentGraph(input: $graph) {
          _id
          name
        }
        changeExperimentStatus(input: $status)
        updateExperimentProgress(input: $progress)
        updateExperimentOptimizationResult(input: $optimization)
      }
    `,
    {
      variables: {
        create: {
          name: 'Created Experiment',
          description: 'Initial description',
          fileId,
        },
        update: {
          _id: experimentId,
          name: 'Updated Experiment',
          description: 'Updated description',
        },
        graph: {
          _id: experimentId,
          stages: [
            {
              stage: 'PREPROCESSING',
              technologyIds: [technologyId],
            },
          ],
        },
        status: {
          experimentId,
          status: 'computing',
        },
        progress: {
          experimentId,
          progress: 55.5,
          message: 'Halfway there',
          status: OptimizationStatus.optimizing,
        },
        optimization: {
          experimentId,
          bestPipelineId: pipelineId,
          score: 0.88,
        },
      },
      context: createGraphqlContext({ req: { headers: { authorization: 'Bearer token' } } as any }),
    }
  );

  assert.equal(result.errors, undefined);
  assert.deepEqual(toPlainValue(result.data), {
    createExperiment: {
      _id: experimentId,
      name: 'Created Experiment',
    },
    updateExperiment: {
      _id: experimentId,
      name: 'Updated Experiment',
      description: 'Updated description',
    },
    generateExperimentGraph: {
      _id: experimentId,
      name: 'Updated Experiment',
    },
    changeExperimentStatus: true,
    updateExperimentProgress: true,
    updateExperimentOptimizationResult: true,
  });
  assert.deepEqual(toPlainValue(calls), [
    [
      'create',
      {
        name: 'Created Experiment',
        description: 'Initial description',
        fileId,
      },
      userId.toHexString(),
    ],
    [
      'update',
      {
        _id: experimentId,
        name: 'Updated Experiment',
        description: 'Updated description',
      },
      userId.toHexString(),
    ],
    ['findOneWorkflow', { instanceId: experimentId, type: WorkflowType.EXPERIMENT }],
    [
      'generateGraph',
      {
        _id: experimentId,
        stages: [{ stage: 'PREPROCESSING', technologyIds: [technologyId] }],
      },
      userId.toHexString(),
    ],
    ['findOneWorkflow', { instanceId: experimentId, type: WorkflowType.EXPERIMENT }],
    ['changeStatus', { experimentId, status: 'configuring' }],
    ['getById', experimentId, userId.toHexString()],
    ['changeStatus', { experimentId, status: 'computing' }],
    [
      'updateExperimentProgress',
      {
        experimentId,
        progress: 55.5,
        message: 'Halfway there',
        status: 'optimizing',
      },
    ],
    [
      'updateExperimentOptimizationResult',
      {
        experimentId,
        bestPipelineId: pipelineId,
        score: 0.88,
      },
    ],
  ]);
});
