import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import React from 'react';

import {
  createUseStateStub,
  findElement,
  findElements,
  getElementName,
  loadFreshModule,
  stubResolvedModule,
} from './testUtils';

const stubReactHooks = (t: TestContext, compiledFile: string, seededState: unknown[] = []) => {
  const state = createUseStateStub(seededState);

  stubResolvedModule(t, compiledFile, 'react', {
    ...React,
    useState: state.useState,
    useMemo: <T,>(factory: () => T) => factory(),
  });

  return state;
};

test('OptimizationCard starts optimization, renders leaderboard, and exposes history modal state', async (t) => {
  const modulePath = path.resolve(
    __dirname,
    '../src/components/experiments/OptimizationCard/OptimizationCard'
  );
  const compiledFile = path.resolve(
    __dirname,
    '../src/components/experiments/OptimizationCard/OptimizationCard.js'
  );
  const optimizeCalls: any[] = [];
  const refetchCalls: string[] = [];

  const state = stubReactHooks(t, compiledFile);
  stubResolvedModule(t, compiledFile, 'react-router-dom', {
    useParams: () => ({ id: 'exp-1' }),
  });
  stubResolvedModule(t, compiledFile, '../../../config/config', {
    config: {
      renderer: { graphqlEndpoint: 'http://localhost:4000/graphql' },
    },
  });
  stubResolvedModule(t, compiledFile, '../../pages/ExperimentDetailsPage/graphql', {
    useExperimentQuery: () => ({
      data: {
        experiment: {
          _id: 'exp-1',
          status: 'completed',
          optimization: {
            status: 'completed',
            progress: 100,
            bestPipelineId: 'pipe-1',
            bestScore: 0.1234,
            history: [{ createdAt: '2026-04-10T10:00:00Z', message: 'Optimization finished' }],
          },
          graph: {
            nodes: [
              {
                _id: 'node-1',
                label: 'Preprocess',
                stage: 'PREPROCESSING',
                technology: 'Normalize',
                type: 'stage',
                parentId: null,
              },
              {
                _id: 'node-2',
                label: 'SVM',
                stage: 'CLASSIFICATION',
                technology: 'SVM',
                type: 'stage',
                parentId: 'node-1',
              },
            ],
            settings: {
              queues: ['local', 'cloud'],
              folds: 5,
              hyperOptimizationMinutesPerPipeline: 10,
              predictDataPercent: 20,
              metrics: { accuracy: 0.4, f1: 0.2, rocAuc: 0.2, ntps: 0.2 },
            },
          },
        },
      },
      error: null,
      refetch: async () => refetchCalls.push('experiment'),
    }),
    usePipelinesQuery: () => ({
      data: {
        pipelines: [
          {
            _id: 'pipe-1',
            queue: 'local',
            status: 'completed',
            createdAt: '2026-04-10T10:00:00Z',
            pathNodeIds: ['node-1', 'node-2'],
            pathNodes: [{ label: 'Preprocess' }, { label: 'SVM' }],
            optimizationScores: [0.1234],
            computingResult: {
              accuracyScores: [0.9, 0.8],
              f1Scores: [0.7, 0.6],
              rocAucScores: [0.95, 0.85],
              duration: 12.345,
              sampleCount: 5,
            },
          },
          {
            _id: 'pipe-2',
            queue: 'cloud',
            status: 'completed',
            createdAt: '2026-04-10T09:00:00Z',
            pathNodeIds: ['node-1', 'node-2'],
            pathNodes: [{ label: 'Preprocess' }, { label: 'CNN' }],
            optimizationScores: [0.5234],
            computingResult: {
              accuracyScores: [0.7, 0.6],
              f1Scores: [0.5, 0.4],
              rocAucScores: [0.75, 0.65],
              duration: 9.5,
              sampleCount: 10,
            },
          },
        ],
      },
      error: null,
      refetch: async () => refetchCalls.push('pipelines'),
    }),
    useOptimizeExperimentRunsLazyQuery: () => [
      async (options: any) => {
        optimizeCalls.push(options);
        return { data: { optimizeExperimentRuns: true } };
      },
      { loading: false, error: null },
    ],
  });

  const module =
    loadFreshModule<
      typeof import('../src/components/experiments/OptimizationCard/OptimizationCard')
    >(modulePath);
  const tree = module.default({});
  const buttons = findElements(tree, (element) => element.type === 'button');
  const startButton = buttons.find(
    (element) =>
      element.props.children === 'Перезапустити оптимізацію' ||
      element.props.children === 'Запустити оптимізацію'
  );
  const historyButton = buttons.find((element) => element.props.children === 'Історія');
  const leaderboardTable = findElements(
    tree,
    (element) => getElementName(element) === 'DataTable'
  )[0];
  const downloadLink = findElements(tree, (element) => element.type === 'a').find(
    (element) => element.props.download === 'experiment-exp-1-report.pdf'
  );

  assert.equal(leaderboardTable.props.className, 'path-table optimization-leaderboard-table');
  assert.equal(leaderboardTable.props.columns[1].header, 'Інтегральне значення');
  assert.equal(leaderboardTable.props.columns[1].meta.className, 'optimization-integral-column');
  assert.equal(leaderboardTable.props.columns[2].header, 'Точність');
  assert.equal(leaderboardTable.props.columns[2].meta.className, 'optimization-metric-column');
  assert.equal(leaderboardTable.props.columns[3].header, 'F1-міра');
  assert.equal(leaderboardTable.props.columns[4].header, 'Площа під ROC-кривою');
  assert.equal(
    leaderboardTable.props.columns[5].header,
    'Нормалізований час обробки одного зразка даних'
  );

  await startButton!.props.onClick();
  historyButton!.props.onClick();

  assert.equal(
    leaderboardTable.props.columns[1].cell({
      row: { original: { score: 0.1234 } },
    }),
    '0.123400'
  );
  assert.equal(
    leaderboardTable.props.columns[2].cell({
      row: { original: { averageAccuracy: 0.85 } },
    }),
    '0.850000'
  );
  assert.equal(
    leaderboardTable.props.columns[3].cell({
      row: { original: { averageF1: 0.65 } },
    }),
    '0.650000'
  );
  assert.equal(
    leaderboardTable.props.columns[4].cell({
      row: { original: { averageRocAuc: 0.9 } },
    }),
    '0.900000'
  );
  assert.equal(
    leaderboardTable.props.columns[5].cell({
      row: { original: { normalizedProcessingTime: 2.469 } },
    }),
    '2.469000 с/зразок'
  );
  leaderboardTable.props.columns[6].cell({
    row: { original: { queue: 'local' } },
  });
  leaderboardTable.props.columns[7].cell({
    row: { original: { status: 'completed' } },
  });

  assert.deepEqual(optimizeCalls, [{ variables: { experimentId: 'exp-1' } }]);
  assert.deepEqual(refetchCalls, ['experiment', 'pipelines']);
  assert.equal(downloadLink?.props.href, 'http://localhost:4000/experiments/exp-1/report');
  assert.ok(state.calls.some((call) => call.index === 0 && call.value === true));
});
