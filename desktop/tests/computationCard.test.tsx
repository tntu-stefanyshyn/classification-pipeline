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
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanup();
    },
  });

  return state;
};

test('ComputationCard runs bulk and re-run actions, renders table actions, and previews the graph', async (t) => {
  const modulePath = path.resolve(
    __dirname,
    '../src/components/experiments/ComputationCard/ComputationCard'
  );
  const compiledFile = path.resolve(
    __dirname,
    '../src/components/experiments/ComputationCard/ComputationCard.js'
  );
  const refetchCalls: string[] = [];
  const stopCalls: any[] = [];
  const enqueueCalls: any[] = [];
  const pauseCalls: any[] = [];
  const queueCalls: any[] = [];

  const state = stubReactHooks(t, compiledFile);
  stubResolvedModule(t, compiledFile, 'react-router-dom', {
    useParams: () => ({ id: 'exp-1' }),
  });
  stubResolvedModule(t, compiledFile, '@apollo/client', {
    gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (text, chunk, index) => text + chunk + (index < values.length ? String(values[index]) : ''),
        ''
      ),
    skipToken: Symbol('skip-token'),
    useQuery: () => ({ data: null, loading: false, error: null }),
    useLazyQuery: () => [() => undefined, { data: null, loading: false, error: null }],
    useSuspenseQuery: () => ({ data: null }),
  });
  stubResolvedModule(t, compiledFile, 'reactflow', {
    __esModule: true,
    default: function ReactFlow(props: any) {
      return React.createElement('react-flow', props);
    },
  });
  stubResolvedModule(t, compiledFile, '../../experiments/ExperimentGraphConstructor', {
    GraphNode: function GraphNode(props: any) {
      return React.createElement('graph-node', props);
    },
    ROOT_NODE_ID: 'root',
    ExperimentStatus: {
      computing: 'computing',
      optimization: 'optimization',
      completed: 'completed',
    },
    buildFlowElements: ({ nodes }: any) => ({
      flowNodes: nodes.map((node: any) => ({ id: node._id, data: node })),
      flowEdges: [{ id: 'edge-root-node-1', source: 'root', target: 'node-1' }],
    }),
  });
  stubResolvedModule(t, compiledFile, '../../pages/ExperimentDetailsPage', {
    runStatusColors: {
      queued: '#2563eb',
      running: '#f59e0b',
      completed: '#22c55e',
      idle: '#cbd5e1',
    },
    runStatusPriority: {
      running: 1,
      queued: 2,
      completed: 3,
      idle: 4,
    },
    statusLegendOrder: ['queued', 'running', 'completed', 'idle'],
  });
  stubResolvedModule(t, compiledFile, '../../pages/ExperimentDetailsPage/graphql', {
    useExperimentQuery: () => ({
      data: {
        experiment: {
          _id: 'exp-1',
          status: 'computing',
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
              predictDataPercent: 20,
              metrics: { accuracy: 0.4, f1: 0.2, rocAuc: 0.2, ntps: 0.2 },
            },
          },
        },
      },
      refetch: async () => refetchCalls.push('experiment'),
    }),
    usePipelinesQuery: () => ({
      data: {
        pipelines: [
          {
            _id: 'run-1',
            pathNodeIds: ['node-1', 'node-2'],
            pathNodes: [{ label: 'Preprocess' }, { label: 'SVM' }],
            status: 'completed',
            queue: 'local',
            createdAt: '2026-04-10T10:00:00Z',
            updatedAt: '2026-04-10T10:30:00Z',
            history: [{ message: 'done' }],
            machineInfo: {
              hostname: 'workstation',
              cpuModel: 'M2',
              gpuModel: 'RTX',
              memoryGb: 32,
              cores: 12,
            },
          },
          // An idle and a running run, so both bulk actions have something to count.
          {
            _id: 'run-2',
            pathNodeIds: ['node-1', 'node-3'],
            pathNodes: [],
            status: 'idle',
            queue: 'local',
            createdAt: '2026-04-10T10:00:00Z',
            updatedAt: '2026-04-10T10:00:00Z',
            history: [],
          },
          {
            _id: 'run-3',
            pathNodeIds: ['node-1', 'node-4'],
            pathNodes: [],
            status: 'running',
            queue: 'local',
            createdAt: '2026-04-10T10:00:00Z',
            updatedAt: '2026-04-10T10:00:00Z',
            history: [],
          },
        ],
      },
      loading: false,
      error: null,
      refetch: async () => refetchCalls.push('runs'),
    }),
    useEnqueueExperimentRunsMutation: () => [
      async (options: any) => {
        enqueueCalls.push(options);
      },
      { loading: false, error: null },
    ],
    useQueueExperimentRunsMutation: () => [
      async (options: any) => {
        queueCalls.push(options);
        // The only idle run was claimed before the mutation ran, so the server queued none.
        return { data: { queueExperimentRuns: [] } };
      },
    ],
    usePauseExperimentRunsMutation: () => [
      async (options: any) => {
        pauseCalls.push(options);
        return { data: { pauseExperimentRuns: [{ _id: 'run-3' }] } };
      },
    ],
    useStopExperimentRunMutation: () => [
      async (options: any) => {
        stopCalls.push(options);
      },
      { loading: false, error: null },
    ],
  });
  stubResolvedModule(t, compiledFile, './components/ResultModal/ResultModal', {
    __esModule: true,
    default: function ResultModal(props: any) {
      return React.createElement('result-modal', props);
    },
  });
  stubResolvedModule(t, compiledFile, './components/CompareModal/CompareModal', {
    __esModule: true,
    default: function CompareModal(props: any) {
      return React.createElement('compare-modal', props);
    },
  });
  stubResolvedModule(t, compiledFile, './components', {
    ChangePipelineStatusButton: function ChangePipelineStatusButton(props: any) {
      return React.createElement('change-pipeline-status-button', props, props.children);
    },
  });

  const confirmQuestions: string[] = [];
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      confirm: (question: string) => {
        confirmQuestions.push(question);
        return true;
      },
    },
  });
  t.after(() => {
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else delete (globalThis as typeof globalThis & { window?: unknown }).window;
  });

  const module =
    loadFreshModule<typeof import('../src/components/experiments/ComputationCard/ComputationCard')>(
      modulePath
    );
  const tree = module.default({});
  const buttonWithText = (text: string) =>
    findElements(tree, (element) => element.type === 'button').find((element) =>
      [element.props.children].flat().includes(text)
    );
  const dataTable = findElement(tree, (element) => getElementName(element) === 'DataTable');
  const reactFlow = findElement(tree, (element) => getElementName(element) === 'ReactFlow');

  // "Queue all idle" and "Stop all" act on the selected queue and ask first, with the count.
  await buttonWithText('Поставити всі очікувані в чергу')!.props.onClick();
  await buttonWithText('Зупинити все')!.props.onClick();
  // The confirmed ids are sent, so a run that became eligible later is not touched.
  assert.deepEqual(queueCalls, [
    { variables: { experimentId: 'exp-1', queue: 'local', pipelineIds: ['run-2'] } },
  ]);
  assert.deepEqual(pauseCalls, [
    { variables: { experimentId: 'exp-1', queue: 'local', pipelineIds: ['run-3'] } },
  ]);
  assert.equal(enqueueCalls.length, 0);
  assert.equal(confirmQuestions.length, 2);
  assert.ok(confirmQuestions.every((question) => question.endsWith(': 1')));

  // Re-run is offered on the newest completed run of a path and sends the rerun flag.
  const completed = dataTable!.props.data[0];
  const completedActions = dataTable!.props.columns[4].cell({ row: { original: completed } });
  await findElement(
    completedActions,
    (element) => typeof element.props?.onClick === 'function'
  )!.props.onClick();
  assert.deepEqual(enqueueCalls[0], {
    variables: {
      input: { experimentId: 'exp-1', queue: 'local', pipelineId: 'run-1', rerun: true },
    },
  });

  dataTable!.props.columns[1].cell({
    row: { original: { status: 'idle' } },
  });
  const resultsCell = dataTable!.props.columns[2].cell({
    row: { original: { _id: 'run-1', status: 'completed' }, index: 0 },
  });
  findElement(resultsCell, (element) => element.type === 'button')!.props.onClick();
  // Completed runs can be ticked for the side-by-side comparison.
  findElement(
    resultsCell,
    (element) => getElementName(element) === 'CheckboxField'
  )!.props.onChange();
  dataTable!.props.columns[3].cell({
    row: { original: { history: [{ message: 'done' }] } },
  });
  dataTable!.props.columns[4].cell({
    row: { original: { status: 'idle', _id: 'run-1' } },
  });
  // Stop on a running run is an explicit stopExperimentRun, not a generic status change.
  const runningActions = dataTable!.props.columns[4].cell({
    row: { original: { status: 'running', _id: 'run-3' } },
  });
  await findElement(
    runningActions,
    (element) => typeof element.props?.onClick === 'function'
  )!.props.onClick();
  assert.deepEqual(stopCalls, [{ variables: { input: { runId: 'run-3' } } }]);

  assert.ok(refetchCalls.includes('runs') && refetchCalls.includes('experiment'));
  assert.equal(reactFlow!.props.edges[0].style.stroke, '#22c55e');
  assert.ok(state.calls.some((call) => call.index === 1 && call.value === 'run-1'));
  assert.ok(
    state.calls.some(
      (call) =>
        call.index === 3 && Array.isArray(call.value) && (call.value as string[]).includes('run-1')
    )
  );
  // The message comes from the server result: what was queued and what was skipped.
  const statuses = state.calls.filter((call) => call.index === 5).map((call) => String(call.value));
  assert.ok(
    statuses.some(
      (text) => text.includes('Готово, конвеєрів оброблено: 0.') && text.includes('Пропущено')
    )
  );
  assert.ok(statuses.some((text) => text === 'Готово, конвеєрів оброблено: 1.'));
});
