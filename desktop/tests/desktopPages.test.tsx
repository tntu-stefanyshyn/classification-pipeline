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

const stubReactHooks = (
  t: TestContext,
  compiledFile: string,
  options: { seededState?: unknown[]; refs?: unknown[] } = {}
) => {
  const state = createUseStateStub(options.seededState ?? []);
  const refs = [...(options.refs ?? [])];

  stubResolvedModule(t, compiledFile, 'react', {
    ...React,
    useState: state.useState,
    useMemo: <T,>(factory: () => T) => factory(),
    useCallback: <T extends (...args: any[]) => any>(callback: T) => callback,
    useRef: <T,>(value: T) => (refs.shift() as { current: T } | undefined) ?? { current: value },
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanup();
    },
  });

  return state;
};

test('DashboardPage sorts experiments by latest activity and refreshes data sources', (t) => {
  const modulePath = path.resolve(__dirname, '../src/components/pages/DashboardPage/DashboardPage');
  const compiledFile = path.resolve(
    __dirname,
    '../src/components/pages/DashboardPage/DashboardPage.js'
  );
  const refetchCalls: string[] = [];

  stubReactHooks(t, compiledFile);
  stubResolvedModule(t, compiledFile, './graphql', {
    useDashboardDataQuery: () => ({
      data: {
        uploadedFiles: [
          {
            _id: 'file-1',
            filename: 'eeg.csv',
            sizeMb: 16,
            uploadedAt: '2026-04-10T09:00:00Z',
            status: 'processed',
          },
        ],
        experiments: [
          {
            _id: 'exp-1',
            name: 'Earlier',
            status: 'creating',
            createdAt: '2026-04-09T10:00:00Z',
            computationHosts: [{ lastSeenAt: '2026-04-09T11:00:00Z' }],
            optimization: { history: [] },
          },
          {
            _id: 'exp-2',
            name: 'Latest',
            status: 'completed',
            createdAt: '2026-04-08T10:00:00Z',
            computationHosts: [{ lastSeenAt: '2026-04-10T12:00:00Z' }],
            optimization: { history: [{ createdAt: '2026-04-10T12:30:00Z' }] },
          },
        ],
      },
      loading: false,
      error: null,
      refetch: () => refetchCalls.push('dashboard'),
    }),
    useServerInfoQuery: () => ({
      data: { serverInfo: { version: '1.2.3', status: 'online', uptimeSeconds: 99 } },
      loading: false,
      error: null,
      refetch: () => refetchCalls.push('server'),
    }),
  });

  const module =
    loadFreshModule<typeof import('../src/components/pages/DashboardPage/DashboardPage')>(
      modulePath
    );
  const tree = module.default({ onLogout: () => undefined });
  const authLayout = findElement(tree, (element) => getElementName(element) === 'AuthLayout');
  const refreshButton = findElements(
    authLayout!.props.actions,
    (element) => element.type === 'button'
  )[0];
  const experimentLinks = findElements(
    authLayout!.props.children,
    (element) =>
      element.props.className === 'experiment-link' && typeof element.props.to === 'string'
  );

  refreshButton.props.onClick();

  assert.deepEqual(refetchCalls, ['dashboard', 'server']);
  assert.equal(experimentLinks[0].props.to, '/app/experiments/exp-2');
});

test('FilesPage handles upload, refresh, delete, and column renderers', async (t) => {
  const modulePath = path.resolve(__dirname, '../src/components/pages/FilesPage/FilesPage');
  const compiledFile = path.resolve(__dirname, '../src/components/pages/FilesPage/FilesPage.js');
  const fileInputRef = { current: { click: () => actions.push('pick-file'), value: 'filled' } };
  const actions: string[] = [];
  const uploadRequests: any[] = [];
  const createFileCalls: any[] = [];
  const deleteCalls: any[] = [];
  const refetchCalls: string[] = [];

  const previousFetch = globalThis.fetch;
  const previousWindow = (globalThis as typeof globalThis & { window?: unknown }).window;
  globalThis.fetch = (async () => ({ ok: true })) as typeof globalThis.fetch;
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    value: {
      confirm: () => true,
    },
  });
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousWindow === undefined) {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
      return;
    }
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: previousWindow,
    });
  });

  const state = stubReactHooks(t, compiledFile, { refs: [fileInputRef] });
  stubResolvedModule(t, compiledFile, './graphql', {
    useUploadedFilesQuery: () => ({
      data: {
        uploadedFiles: [
          {
            _id: 'file-1',
            filename: 'signals.csv',
            sizeMb: 8,
            uploadedAt: '2026-04-10T10:00:00Z',
            status: 'processed',
          },
        ],
      },
      loading: false,
      error: null,
      refetch: async () => refetchCalls.push('files'),
    }),
    useSignedUploadUrlLazyQuery: () => [
      async (options: any) => {
        uploadRequests.push(options);
        return {
          data: { signedUploadUrl: { url: 'https://upload.example', key: 'files/key.csv' } },
        };
      },
    ],
    useCreateUploadedFileMutation: () => [
      async (options: any) => {
        createFileCalls.push(options);
        return { data: { createUploadedFile: { _id: 'file-2' } } };
      },
    ],
    useDeleteUploadedFileMutation: () => [
      async (options: any) => {
        deleteCalls.push(options);
        return { data: { deleteUploadedFile: true } };
      },
      { loading: false },
    ],
  });

  const module =
    loadFreshModule<typeof import('../src/components/pages/FilesPage/FilesPage')>(modulePath);
  const tree = module.default({ onLogout: () => undefined });
  const authLayout = findElement(tree, (element) => getElementName(element) === 'AuthLayout');
  const actionButtons = findElements(
    authLayout!.props.actions,
    (element) => element.type === 'button'
  );
  const dataTable = findElement(tree, (element) => getElementName(element) === 'DataTable');
  const fileInput = findElement(tree, (element) => getElementName(element) === 'FileInput');

  actionButtons[0].props.onClick();
  actionButtons[1].props.onClick();

  await fileInput!.props.onChange({
    target: { files: [{ name: 'notes.txt', type: 'text/plain', size: 12 }] },
  });
  await fileInput!.props.onChange({
    target: { files: [{ name: 'signals.csv', type: 'text/csv', size: 1024 * 1024 }] },
  });

  dataTable!.props.columns[2].cell({
    getValue: () => '2026-04-10T10:00:00Z',
  });
  dataTable!.props.columns[3].cell({
    getValue: () => 'processed',
  });
  const deleteCell = dataTable!.props.columns[4].cell({
    row: { original: { _id: 'file-1' } },
  });
  findElement(deleteCell, (element) => element.type === 'button')!.props.onClick();

  assert.deepEqual(actions, ['pick-file']);
  assert.deepEqual(uploadRequests[0].variables.input.filename, 'signals.csv');
  assert.equal(createFileCalls[0].variables.input.storageKey, 'files/key.csv');
  assert.deepEqual(deleteCalls, [{ variables: { _id: 'file-1' } }]);
  assert.ok(refetchCalls.length >= 2);
  assert.ok(refetchCalls.every((value) => value === 'files'));
  assert.equal(fileInputRef.current.value, '');
  assert.ok(state.calls.length >= 4);
});

test('ExperimentsPage opens modal, uploads files, submits creation, and navigates rows', async (t) => {
  const modulePath = path.resolve(
    __dirname,
    '../src/components/pages/ExperimentsPage/ExperimentsPage'
  );
  const compiledFile = path.resolve(
    __dirname,
    '../src/components/pages/ExperimentsPage/ExperimentsPage.js'
  );
  const navigateCalls: string[] = [];
  const fileInputRef = {
    current: { click: () => actions.push('pick-experiment-file'), value: 'preset' },
  };
  const actions: string[] = [];
  const createExperimentCalls: any[] = [];
  const createFileCalls: any[] = [];
  const uploadRequests: any[] = [];
  const refetchCalls: string[] = [];
  const fieldValueCalls: Array<[string, string]> = [];

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true })) as typeof globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  stubReactHooks(t, compiledFile, { seededState: [false, null, true], refs: [fileInputRef] });
  stubResolvedModule(t, compiledFile, 'react-router-dom', {
    useNavigate: () => (url: string) => navigateCalls.push(url),
    Link: function Link(props: any) {
      return React.createElement('link', props, props.children);
    },
  });
  stubResolvedModule(t, compiledFile, './graphql', {
    refetchDashboardDataQuery: () => ({ query: 'dashboard' }),
    refetchExperimentsQuery: () => ({ query: 'experiments' }),
    useExperimentsQuery: () => ({
      data: {
        experiments: [
          {
            _id: 'exp-1',
            name: 'Experiment',
            description: 'Desc',
            status: 'creating',
            createdAt: '2026-04-10T10:00:00Z',
          },
        ],
      },
      loading: false,
      error: null,
      refetch: () => refetchCalls.push('experiments'),
    }),
    useCreateExperimentMutation: () => [
      async (options: any) => {
        createExperimentCalls.push(options);
        return { data: { createExperiment: { _id: 'exp-2' } } };
      },
      { loading: false, error: null },
    ],
    useUploadedFilesQuery: () => ({
      data: {
        uploadedFiles: [{ _id: 'file-1', filename: 'base.csv' }],
      },
      loading: false,
      error: null,
      refetch: async () => refetchCalls.push('files'),
    }),
    useSignedUploadUrlLazyQuery: () => [
      async (options: any) => {
        uploadRequests.push(options);
        return {
          data: { signedUploadUrl: { url: 'https://upload.example', key: 'experiments/file.csv' } },
        };
      },
    ],
    useCreateUploadedFileMutation: () => [
      async (options: any) => {
        createFileCalls.push(options);
        return { data: { createUploadedFile: { _id: 'file-2' } } };
      },
    ],
  });

  const module =
    loadFreshModule<typeof import('../src/components/pages/ExperimentsPage/ExperimentsPage')>(
      modulePath
    );
  const tree = module.default({ onLogout: () => undefined });
  const authLayout = findElement(tree, (element) => getElementName(element) === 'AuthLayout');
  const actionButtons = findElements(
    authLayout!.props.actions,
    (element) => element.type === 'button'
  );
  const dataTable = findElement(tree, (element) => getElementName(element) === 'DataTable');
  const formik = findElement(tree, (element) => getElementName(element) === 'Formik');

  actionButtons[0].props.onClick();
  actionButtons[1].props.onClick();

  dataTable!.props.onRowClick({ _id: 'exp-1' });
  dataTable!.props.columns[1].cell({ getValue: () => 'creating' });
  dataTable!.props.columns[2].cell({ getValue: () => '2026-04-10T10:00:00Z' });
  dataTable!.props.columns[3].cell({ row: { original: { _id: 'exp-1' } } });

  const modalTree = formik!.props.children({
    values: { name: 'Draft', description: 'Desc', fileId: '' },
    handleChange: () => undefined,
    handleBlur: () => undefined,
    setFieldValue: (field: string, value: string) => fieldValueCalls.push([field, value]),
    isSubmitting: false,
    status: null,
  });

  findElements(modalTree, (element) => element.type === 'button')
    .find((element) => element.props.children === 'Завантажити CSV')!
    .props.onClick();
  const fileInput = findElement(modalTree, (element) => getElementName(element) === 'FileInput');

  await fileInput!.props.onChange({
    target: { files: [{ name: 'readme.md', type: 'text/markdown', size: 20 }] },
  });
  await fileInput!.props.onChange({
    target: { files: [{ name: 'dataset.csv', type: 'text/csv', size: 1024 * 1024 }] },
  });

  await formik!.props.onSubmit(
    { name: '  New Experiment  ', description: '  Fresh run  ', fileId: ' ' },
    {
      resetForm: () => actions.push('reset-form'),
      setStatus: () => undefined,
      setSubmitting: () => undefined,
    }
  );

  assert.deepEqual(navigateCalls, ['/app/experiments/exp-1']);
  assert.deepEqual(actions, ['pick-experiment-file', 'reset-form']);
  assert.equal(uploadRequests[0].variables.input.filename, 'dataset.csv');
  assert.equal(createFileCalls[0].variables.input.storageKey, 'experiments/file.csv');
  assert.deepEqual(fieldValueCalls, [['fileId', 'file-2']]);
  assert.equal(createExperimentCalls[0].variables.input.name, 'New Experiment');
  assert.equal(createExperimentCalls[0].variables.input.description, 'Fresh run');
  assert.equal(createExperimentCalls[0].variables.input.fileId, null);
  assert.deepEqual(refetchCalls, ['experiments', 'files']);
  assert.equal(fileInputRef.current.value, '');
});

test('ExperimentDetailsPage saves settings, uploads replacement files, and updates the experiment', async (t) => {
  const modulePath = path.resolve(
    __dirname,
    '../src/components/pages/ExperimentDetailsPage/ExperimentDetailsPage'
  );
  const compiledFile = path.resolve(
    __dirname,
    '../src/components/pages/ExperimentDetailsPage/ExperimentDetailsPage.js'
  );
  const fileInputRef = {
    current: { click: () => actions.push('pick-details-file'), value: 'preset' },
  };
  const actions: string[] = [];
  const updateExperimentCalls: any[] = [];
  const updateSettingsCalls: any[] = [];
  const uploadRequests: any[] = [];
  const createFileCalls: any[] = [];
  const refetchCalls: string[] = [];
  const fieldValueCalls: Array<[string, string]> = [];
  const ExperimentStatus = {
    configuring: 'configuring',
    computing: 'computing',
    optimization: 'optimization',
    completed: 'completed',
  };
  const ComputationQueue = { cloud: 'cloud', local: 'local' };
  const PipelineStatus = {
    queued: 'queued',
    running: 'running',
    completed: 'completed',
    idle: 'idle',
  };

  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async () => ({ ok: true })) as typeof globalThis.fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  stubReactHooks(t, compiledFile, { seededState: [false, null, true, true], refs: [fileInputRef] });
  stubResolvedModule(t, compiledFile, 'react-router-dom', {
    useParams: () => ({ id: 'exp-1' }),
    Link: function Link(props: any) {
      return React.createElement('link', props, props.children);
    },
  });
  stubResolvedModule(t, compiledFile, '../../experiments/GraphSettingsModal', {
    GraphSettingsModal: function GraphSettingsModal(props: any) {
      return React.createElement('graph-settings-modal', props);
    },
  });
  stubResolvedModule(t, compiledFile, '../../experiments/ComputationCard/ComputationCard', {
    __esModule: true,
    default: function ComputationCard() {
      return React.createElement('computation-card');
    },
  });
  stubResolvedModule(t, compiledFile, '../../experiments/OptimizationCard/OptimizationCard', {
    __esModule: true,
    default: function OptimizationCard() {
      return React.createElement('optimization-card');
    },
  });
  stubResolvedModule(
    t,
    compiledFile,
    '../../experiments/ChangeExperimentStatusButton/ChangeExperimentStatusButton',
    {
      __esModule: true,
      default: function ChangeExperimentStatusButton(props: any) {
        return React.createElement('change-status-button', props);
      },
    }
  );
  stubResolvedModule(t, compiledFile, '../../../config/config', {
    config: {
      renderer: { graphqlEndpoint: 'http://localhost:4000/graphql' },
    },
  });

  let updateMutationCalls = 0;
  stubResolvedModule(t, compiledFile, './graphql', {
    ExperimentStatus,
    ComputationQueue,
    PipelineStatus,
    refetchExperimentQuery: (variables: any) => ({ query: 'experiment', variables }),
    useExperimentQuery: () => ({
      data: {
        experiment: {
          _id: 'exp-1',
          name: 'EEG Experiment',
          description: 'Detail page',
          fileId: 'file-1',
          status: ExperimentStatus.configuring,
          createdAt: '2026-04-10T10:00:00Z',
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
              metrics: { accuracy: 0.4, f1: 0.2, rocAuc: 0.2, ntps: 0.2 },
              queues: [ComputationQueue.local, ComputationQueue.cloud],
              folds: 5,
              hyperOptimizationMinutesPerPipeline: 15,
              predictDataPercent: 25,
            },
          },
        },
      },
      loading: false,
      error: null,
      refetch: () => refetchCalls.push('experiment'),
    }),
    useUpdateExperimentMutation: () => {
      updateMutationCalls += 1;
      if (updateMutationCalls === 1) {
        return [
          async (options: any) => {
            updateExperimentCalls.push(options);
            return { data: { updateExperiment: { _id: 'exp-1' } } };
          },
          { loading: false, error: null },
        ];
      }
      return [
        async (options: any) => {
          updateSettingsCalls.push(options);
          return { data: { updateExperiment: { _id: 'exp-1' } } };
        },
        { loading: false, error: null },
      ];
    },
    useUploadedFilesQuery: () => ({
      data: {
        uploadedFiles: [{ _id: 'file-1', filename: 'signals.csv', sizeMb: 9 }],
      },
      loading: false,
      error: null,
      refetch: async () => refetchCalls.push('files'),
    }),
    useSignedUploadUrlLazyQuery: () => [
      async (options: any) => {
        uploadRequests.push(options);
        return {
          data: { signedUploadUrl: { url: 'https://upload.example', key: 'details/new.csv' } },
        };
      },
    ],
    useCreateUploadedFileMutation: () => [
      async (options: any) => {
        createFileCalls.push(options);
        return { data: { createUploadedFile: { _id: 'file-2' } } };
      },
    ],
  });

  const module =
    loadFreshModule<
      typeof import('../src/components/pages/ExperimentDetailsPage/ExperimentDetailsPage')
    >(modulePath);
  const tree = module.default({ onLogout: () => undefined });
  const authLayout = findElement(tree, (element) => getElementName(element) === 'AuthLayout');
  const actionButtons = findElements(
    authLayout!.props.actions,
    (element) => element.type === 'button'
  );
  const settingsModal = findElement(
    tree,
    (element) => getElementName(element) === 'GraphSettingsModal'
  );
  const changeStatusButton = findElement(
    tree,
    (element) => getElementName(element) === 'ChangeExperimentStatusButton'
  );
  const formik = findElement(tree, (element) => getElementName(element) === 'Formik');

  actionButtons[0].props.onClick();
  actionButtons[1].props.onClick();
  settingsModal!.props.onSave({
    metrics: { accuracy: 0.25, f1: 0.25, rocAuc: 0.25, ntps: 0.25 },
    queues: [ComputationQueue.local],
    folds: 7,
    hyperOptimizationMinutesPerPipeline: 20,
    predictDataPercent: 30,
  });

  const modalTree = formik!.props.children({
    values: { name: 'Name', description: 'Desc', fileId: '' },
    handleChange: () => undefined,
    handleBlur: () => undefined,
    setFieldValue: (field: string, value: string) => fieldValueCalls.push([field, value]),
    isSubmitting: false,
    status: null,
  });

  findElements(modalTree, (element) => element.type === 'button')
    .find((element) => element.props.children === 'Завантажити CSV')!
    .props.onClick();
  const fileInput = findElement(modalTree, (element) => getElementName(element) === 'FileInput');

  await fileInput!.props.onChange({
    target: { files: [{ name: 'notes.txt', type: 'text/plain', size: 25 }] },
  });
  await fileInput!.props.onChange({
    target: { files: [{ name: 'replacement.csv', type: 'text/csv', size: 1024 * 1024 }] },
  });

  await formik!.props.onSubmit(
    { name: '  Updated name  ', description: '  Updated desc  ', fileId: ' file-2 ' },
    {
      setSubmitting: () => undefined,
      setStatus: () => undefined,
    }
  );

  assert.equal(changeStatusButton!.props.disabled, false);
  assert.deepEqual(actions, ['pick-details-file']);
  assert.equal(uploadRequests[0].variables.input.filename, 'replacement.csv');
  assert.equal(createFileCalls[0].variables.input.storageKey, 'details/new.csv');
  assert.deepEqual(fieldValueCalls, [['fileId', 'file-2']]);
  assert.equal(updateSettingsCalls[0].variables.input.graphSettings.folds, 7);
  assert.equal(updateExperimentCalls[0].variables.input.name, 'Updated name');
  assert.equal(updateExperimentCalls[0].variables.input.description, 'Updated desc');
  assert.equal(updateExperimentCalls[0].variables.input.fileId, 'file-2');
  assert.deepEqual(refetchCalls, ['experiment', 'files']);
  assert.equal(fileInputRef.current.value, '');
});
