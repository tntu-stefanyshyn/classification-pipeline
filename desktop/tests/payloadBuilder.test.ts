import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildHandlerPayload } from '../src/workers/localComputation/payloadBuilder';

test('buildHandlerPayload keeps run path order and normalizes node settings', () => {
  const run = {
    _id: 'run-1',
    experimentId: 'exp-1',
    queue: 'local',
    pathNodeIds: ['node-2', 'node-1'],
  } as any;
  const experiment = {
    fileId: 'file-1',
    graph: {
      nodes: [
        {
          _id: 'node-1',
          stage: 'PREPROCESSING',
          technology: 'Normalize',
          settings: [{ key: 'log', value: 'true' }],
        },
        {
          _id: 'node-2',
          stage: 'CLASSIFICATION',
          technology: 'SVM',
          settings: null,
        },
      ],
    },
  } as any;

  assert.deepEqual(buildHandlerPayload(run, experiment), {
    backend_url: 'http://host.docker.internal:4000/graphql',
    pipelineId: 'run-1',
    experiment_id: 'exp-1',
    queue: 'local',
    file_id: 'file-1',
    path: [
      {
        node_id: 'node-2',
        stage: 'CLASSIFICATION',
        technology: 'SVM',
        settings: [],
      },
      {
        node_id: 'node-1',
        stage: 'PREPROCESSING',
        technology: 'Normalize',
        settings: [{ key: 'log', value: 'true' }],
      },
    ],
  });
});

test('buildHandlerPayload rejects empty experiment graph', () => {
  assert.throws(
    () =>
      buildHandlerPayload(
        {
          _id: 'run-1',
          experimentId: 'exp-1',
          queue: 'local',
          pathNodeIds: [],
        } as any,
        { graph: { nodes: [] } } as any
      ),
    /Experiment graph is empty/
  );
});

test('buildHandlerPayload rejects missing path nodes', () => {
  assert.throws(
    () =>
      buildHandlerPayload(
        {
          _id: 'run-1',
          experimentId: 'exp-1',
          queue: 'local',
          pathNodeIds: ['missing-node'],
        } as any,
        {
          graph: {
            nodes: [
              {
                _id: 'node-1',
                stage: 'PREPROCESSING',
                technology: 'Normalize',
                settings: [],
              },
            ],
          },
        } as any
      ),
    /Graph path nodes are missing/
  );
});
