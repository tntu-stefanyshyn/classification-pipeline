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

test('ComputationCard moves local runs to waiting, renders table actions, and previews the graph', async (t) => {
  const modulePath = path.resolve(
    __dirname,
    '../src/components/experiments/ComputationCard/ComputationCard'
  );
  const compiledFile = path.resolve(
    __dirname,
    '../src/components/experiments/ComputationCard/ComputationCard.js'
  );
  const refetchCalls: string[] = [];
  const statusChanges: any[] = [];
  const apolloQueries: any[] = [];

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
    useApolloClient: () => ({
      query: async (options: any) => {
        apolloQueries.push(options);
        return {
          data: {
            pipelines: [
              { _id: 'local-1', status: 'idle' },
              { _id: 'local-2', status: 'running' },
              { _id: 'local-3', status: 'completed' },
            ],
          },
        };
      },
    }),
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
        ],
      },
      loading: false,
      error: null,
      refetch: async () => refetchCalls.push('runs'),
    }),
    useEnqueueExperimentRunsMutation: () => [
      async () => undefined,
      { loading: false, error: null },
    ],
    useStopExperimentRunMutation: () => [async () => undefined, { loading: false, error: null }],
  });
  stubResolvedModule(t, compiledFile, './components/ResultModal/ResultModal', {
    __esModule: true,
    default: function ResultModal(props: any) {
      return React.createElement('result-modal', props);
    },
  });
  stubResolvedModule(t, compiledFile, './components', {
    ChangePipelineStatusButton: function ChangePipelineStatusButton(props: any) {
      return React.createElement('change-pipeline-status-button', props, props.children);
    },
  });
  stubResolvedModule(
    t,
    compiledFile,
    './components/ChangePipelineStatusButton/graphql/mutations/generated/ChangePipelineStatus',
    {
      useChangePipelineStatusMutation: () => [
        async (options: any) => {
          statusChanges.push(options);
          return { data: { changePipelineStatus: true } };
        },
      ],
    }
  );

  const module =
    loadFreshModule<typeof import('../src/components/experiments/ComputationCard/ComputationCard')>(
      modulePath
    );
  const tree = module.default({});
  const actionButton = findElements(tree, (element) => element.type === 'button').find((element) =>
    Array.isArray(element.props.children)
      ? element.props.children.includes('Перекинути все в очікування')
      : element.props.children === 'Перекинути все в очікування'
  );
  const dataTable = findElement(tree, (element) => getElementName(element) === 'DataTable');
  const reactFlow = findElement(tree, (element) => getElementName(element) === 'ReactFlow');

  await actionButton!.props.onClick();

  dataTable!.props.columns[1].cell({
    row: { original: { status: 'idle' } },
  });
  const resultsCell = dataTable!.props.columns[2].cell({
    row: { original: { _id: 'run-1' }, index: 0 },
  });
  findElement(resultsCell, (element) => element.type === 'button')!.props.onClick();
  dataTable!.props.columns[3].cell({
    row: { original: { history: [{ message: 'done' }] } },
  });
  dataTable!.props.columns[4].cell({
    row: { original: { status: 'idle', _id: 'run-1' } },
  });

  assert.equal(apolloQueries[0].variables.queue, 'local');
  assert.equal(statusChanges.length, 2);
  assert.deepEqual(refetchCalls, ['runs', 'experiment']);
  assert.equal(reactFlow!.props.edges[0].style.stroke, '#22c55e');
  assert.ok(state.calls.some((call) => call.index === 1 && call.value === 'run-1'));
  assert.ok(
    state.calls.some(
      (call) =>
        call.index === 3 &&
        typeof call.value === 'string' &&
        String(call.value).includes('переведено в очікування')
    )
  );
});
