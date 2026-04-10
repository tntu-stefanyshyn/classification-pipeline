import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { loadFreshModule, stubResolvedModule } from './testUtils';

const projectSrcDir = path.resolve(__dirname, '../src');

const generatedModulePaths = [
  '../src/components/experiments/ChangeExperimentStatusButton/graphql/mutations/generated/ChangeExperimentStatus',
  '../src/components/experiments/ComputationCard/components/ChangePipelineStatusButton/graphql/mutations/generated/ChangePipelineStatus',
  '../src/components/experiments/ComputationCard/components/ResultModal/graphql/queries/generated/ExperimentRunInfo',
  '../src/graphql/mutations/generated/claimExperimentRun',
  '../src/graphql/mutations/generated/createExperiment',
  '../src/graphql/mutations/generated/createUploadedFile',
  '../src/graphql/mutations/generated/deleteUploadedFile',
  '../src/graphql/mutations/generated/enqueueExperimentRuns',
  '../src/graphql/mutations/generated/generateExperimentGraph',
  '../src/graphql/mutations/generated/login',
  '../src/graphql/mutations/generated/pauseExperimentRuns',
  '../src/graphql/mutations/generated/register',
  '../src/graphql/mutations/generated/resumeExperimentRuns',
  '../src/graphql/mutations/generated/stopExperimentRun',
  '../src/graphql/mutations/generated/updateExperiment',
  '../src/graphql/queries/generated/dashboard',
  '../src/graphql/queries/generated/experiment',
  '../src/graphql/queries/generated/experimentForRun',
  '../src/graphql/queries/generated/experiments',
  '../src/graphql/queries/generated/me',
  '../src/graphql/queries/generated/optimizeExperimentRuns',
  '../src/graphql/queries/generated/pipeline',
  '../src/graphql/queries/generated/pipelines',
  '../src/graphql/queries/generated/serverInfo',
  '../src/graphql/queries/generated/signedUpload',
  '../src/graphql/queries/generated/technologies',
  '../src/graphql/queries/generated/uploadedFiles',
  '../src/components/auth/LoginForm/graphql',
  '../src/components/auth/RegisterForm/graphql',
  '../src/components/experiments/ExperimentGraphConstructor/graphql',
  '../src/components/pages/DashboardPage/graphql',
  '../src/components/pages/ExperimentDetailsPage/graphql',
  '../src/components/pages/ExperimentsPage/graphql',
  '../src/components/pages/FilesPage/graphql',
  '../src/router/AppRouter/graphql',
];

const toCompiledModulePath = (modulePath: string) => path.resolve(__dirname, `${modulePath}.js`);

const createApolloStub = () => {
  const calls: Array<{ kind: string; options?: unknown; variables?: unknown }> = [];
  const skipToken = Symbol('skip-token');

  const stub = {
    __esModule: true,
    gql: (strings: TemplateStringsArray, ...values: unknown[]) =>
      strings.reduce(
        (text, chunk, index) => text + chunk + (index < values.length ? String(values[index]) : ''),
        ''
      ),
    skipToken,
    useQuery: (_document: unknown, options?: unknown) => {
      calls.push({ kind: 'query', options });
      return { data: null, loading: false, error: null, options };
    },
    useLazyQuery: (_document: unknown, options?: unknown) => {
      calls.push({ kind: 'lazy-query', options });
      return [() => undefined, { data: null, loading: false, error: null }];
    },
    useSuspenseQuery: (_document: unknown, options?: unknown) => {
      calls.push({ kind: 'suspense-query', options });
      return { data: null, options };
    },
    useMutation: (_document: unknown, options?: { variables?: unknown }) => {
      calls.push({ kind: 'mutation', options, variables: options?.variables });
      return [() => Promise.resolve({ data: null }), { loading: false, error: null }];
    },
    ApolloClient: class ApolloClient {
      config: unknown;

      constructor(config: unknown) {
        this.config = config;
      }
    },
    HttpLink: class HttpLink {
      options: unknown;

      constructor(options: unknown) {
        this.options = options;
      }
    },
    InMemoryCache: class InMemoryCache {},
    from: (links: unknown[]) => ({ links }),
  };

  return { stub, calls, skipToken };
};

const exerciseGraphqlModule = (exportsObject: Record<string, unknown>, skipToken: unknown) => {
  Object.entries(exportsObject).forEach(([name, value]) => {
    if (typeof value !== 'function') {
      return;
    }

    if (name.startsWith('refetch')) {
      value({
        _id: 'exp-1',
        experimentId: 'exp-1',
        pipelineId: 'pipe-1',
        queue: 'local',
        input: {},
      });
      return;
    }

    if (name.startsWith('use') && name.endsWith('Mutation')) {
      value({ variables: { input: { _id: 'exp-1' } } });
      return;
    }

    if (name.startsWith('use') && name.includes('LazyQuery')) {
      value({ variables: { _id: 'exp-1' } });
      return;
    }

    if (name.startsWith('use') && name.includes('SuspenseQuery')) {
      value({ variables: { _id: 'exp-1' } });
      value(skipToken);
      return;
    }

    if (name.startsWith('use') && name.endsWith('Query')) {
      value({ variables: { _id: 'exp-1' }, skip: false });
    }
  });
};

test('generated GraphQL wrappers and barrel files call Apollo hooks', (t) => {
  const firstCompiledFile = toCompiledModulePath(generatedModulePaths[0]);
  const { stub: apolloStub, calls, skipToken } = createApolloStub();

  stubResolvedModule(t, firstCompiledFile, '@apollo/client', apolloStub);

  const loadedModules = generatedModulePaths.map((modulePath) =>
    loadFreshModule<Record<string, unknown>>(path.resolve(__dirname, modulePath))
  );

  loadedModules.forEach((moduleExports) => {
    exerciseGraphqlModule(moduleExports, skipToken);
  });

  assert.ok(calls.some((call) => call.kind === 'query'));
  assert.ok(calls.some((call) => call.kind === 'lazy-query'));
  assert.ok(calls.some((call) => call.kind === 'suspense-query'));
  assert.ok(calls.some((call) => call.kind === 'mutation'));
});

test('graphql client builds auth and error links with translated messages', (t) => {
  const clientModulePath = path.resolve(__dirname, '../src/graphql/client');
  const clientCompiledFile = path.resolve(__dirname, '../src/graphql/client.js');
  const { stub: apolloStub } = createApolloStub();
  const translated: string[] = [];
  const setContextResults: unknown[] = [];
  const processedErrors: Array<{ message?: string; originalMessage?: string }> = [];

  stubResolvedModule(t, clientCompiledFile, '@apollo/client', apolloStub);
  stubResolvedModule(t, clientCompiledFile, '@apollo/client/link/context', {
    __esModule: true,
    setContext: (
      resolver: (value: unknown, context: { headers: Record<string, string> }) => unknown
    ) => {
      setContextResults.push(resolver({}, { headers: { existing: 'header' } }));
      return { kind: 'auth-link' };
    },
  });
  stubResolvedModule(t, clientCompiledFile, '@apollo/client/link/error', {
    __esModule: true,
    onError: (
      handler: (payload: {
        graphQLErrors?: Array<{ message?: string; originalMessage?: string }>;
        networkError?: Array<{ message?: string; originalMessage?: string }>;
      }) => void
    ) => {
      const graphError = { message: 'GraphQL failure' };
      const networkError = { message: 'Network failure' };
      handler({ graphQLErrors: [graphError], networkError: [networkError] });
      processedErrors.push(graphError, networkError);
      return { kind: 'error-link' };
    },
  });
  stubResolvedModule(t, clientCompiledFile, '../services/tokenService', {
    tokenService: {
      getToken: () => 'secret-token',
    },
  });
  stubResolvedModule(t, clientCompiledFile, '../config/config', {
    config: {
      renderer: { graphqlEndpoint: 'http://localhost:4000/graphql' },
    },
  });
  stubResolvedModule(t, clientCompiledFile, '../utils/formError', {
    translateGraphQLError: (error: { message?: string }) => {
      const translatedMessage = `translated:${error.message}`;
      translated.push(translatedMessage);
      return translatedMessage;
    },
  });

  const module = loadFreshModule<{ apolloClient: { config: { link: { links: unknown[] } } } }>(
    clientModulePath
  );

  assert.deepEqual(setContextResults, [
    {
      headers: {
        existing: 'header',
        authorization: 'Bearer secret-token',
      },
    },
  ]);
  assert.deepEqual(translated, ['translated:GraphQL failure', 'translated:Network failure']);
  assert.deepEqual(
    processedErrors.map((error) => ({
      message: error.message,
      originalMessage: error.originalMessage,
    })),
    [
      { message: 'translated:GraphQL failure', originalMessage: 'GraphQL failure' },
      { message: 'translated:Network failure', originalMessage: 'Network failure' },
    ]
  );
  assert.equal(module.apolloClient.config.link.links.length, 3);
});

test('tokenService updates local storage and notifies subscribers', (t) => {
  const tokenServiceModulePath = path.resolve(__dirname, '../src/services/tokenService');
  const tokenServiceCompiledFile = path.resolve(__dirname, '../src/services/tokenService.js');
  const storageCalls: Array<[string, string, string?]> = [];
  const snapshots: Array<string | null> = [];

  const previousLocalStorage = (globalThis as typeof globalThis & { localStorage?: unknown })
    .localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      setItem: (key: string, value: string) => storageCalls.push(['setItem', key, value]),
      removeItem: (key: string) => storageCalls.push(['removeItem', key]),
    },
  });
  t.after(() => {
    if (previousLocalStorage === undefined) {
      delete (globalThis as typeof globalThis & { localStorage?: unknown }).localStorage;
      return;
    }
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: previousLocalStorage,
    });
  });

  stubResolvedModule(t, tokenServiceCompiledFile, 'react', {
    useSyncExternalStore: (
      subscribe: (listener: () => void) => () => void,
      getSnapshot: () => string | null,
      getServerSnapshot: () => string | null
    ) => {
      snapshots.push(getSnapshot(), getServerSnapshot());
      const unsubscribe = subscribe(() => snapshots.push(getSnapshot()));
      unsubscribe();
      return getSnapshot();
    },
  });

  const module =
    loadFreshModule<typeof import('../src/services/tokenService')>(tokenServiceModulePath);
  const listenerCalls: Array<string | null> = [];
  const unsubscribe = module.tokenService.subscribe((token) => listenerCalls.push(token));

  module.tokenService.setToken('next-token');
  module.tokenService.clearToken();
  const currentToken = module.useAuthToken();
  unsubscribe();

  assert.equal(module.tokenService.getToken(), 'token');
  assert.equal(currentToken, 'token');
  assert.deepEqual(listenerCalls, ['next-token', null]);
  assert.deepEqual(storageCalls, [
    ['setItem', 'auth_token', 'next-token'],
    ['removeItem', 'auth_token'],
  ]);
  assert.deepEqual(snapshots, ['token', 'token']);
});

test('types and localization exports stay aligned', () => {
  const typesModule = loadFreshModule<typeof import('../src/graphql/types.generated')>(
    path.resolve(projectSrcDir, 'graphql/types.generated')
  );
  const ukModule = loadFreshModule<typeof import('../src/i18n/uk')>(
    path.resolve(projectSrcDir, 'i18n/uk')
  );

  assert.equal(typesModule.ClassificationStage.CLASSIFICATION, 'CLASSIFICATION');
  assert.equal(typesModule.ComputationQueue.local, 'local');
  assert.equal(ukModule.default.computationQueue.local, 'Локальна черга');
  assert.equal(ukModule.default.experimentStatus.completed, 'Завершено');
});
