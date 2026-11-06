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
  '../src/graphql/mutations/generated/logout',
  '../src/graphql/mutations/generated/pauseExperimentRuns',
  '../src/graphql/mutations/generated/refreshSession',
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

test('graphql client builds error, session and auth links with translated messages', (t) => {
  const clientModulePath = path.resolve(__dirname, '../src/graphql/client');
  const clientCompiledFile = path.resolve(__dirname, '../src/graphql/client.js');
  const { stub: apolloStub } = createApolloStub();
  const translated: string[] = [];
  const authLinkTokens: unknown[] = [];
  const processedErrors: Array<{ message?: string; originalMessage?: string }> = [];

  stubResolvedModule(t, clientCompiledFile, '@apollo/client', apolloStub);
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
  const tokenListeners: Array<(token: string | null) => void> = [];
  const tokenService = {
    subscribe: (listener: (token: string | null) => void) => tokenListeners.push(listener),
  };
  stubResolvedModule(t, clientCompiledFile, '../services/tokenService', { tokenService });
  stubResolvedModule(t, clientCompiledFile, './sessionLink', {
    createSessionLink: () => ({ kind: 'session-link' }),
    createAuthLink: (tokens: unknown) => {
      authLinkTokens.push(tokens);
      return { kind: 'auth-link' };
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

  let storeResets = 0;
  apolloStub.ApolloClient.prototype.clearStore = async () => {
    storeResets += 1;
  };
  const module = loadFreshModule<{ apolloClient: { config: { link: { links: unknown[] } } } }>(
    clientModulePath
  );

  // The auth link itself is tested in sessionLink.test.ts, together with the retries it guards.
  assert.deepEqual(authLinkTokens, [tokenService]);
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
  const links = module.apolloClient.config.link.links;
  // The session link sits inside the error link, so it sees the codes before the messages are
  // translated, and above the auth link, so a retry reads the refreshed token.
  assert.deepEqual(links.slice(0, 3), [
    { kind: 'error-link' },
    { kind: 'session-link' },
    { kind: 'auth-link' },
  ]);
  assert.ok(links[3] instanceof apolloStub.HttpLink);
  tokenListeners.forEach((listener) => listener('still-signed-in'));
  assert.equal(storeResets, 0);
  tokenListeners.forEach((listener) => listener(null));
  assert.equal(storeResets, 1);
});

test('tokenService keeps both tokens together and reports an expired session', (t) => {
  const tokenServiceModulePath = path.resolve(__dirname, '../src/services/tokenService');
  const tokenServiceCompiledFile = path.resolve(__dirname, '../src/services/tokenService.js');
  const storedValues = new Map([['auth_token', 'saved-token']]);

  const previousLocalStorage = (globalThis as typeof globalThis & { localStorage?: unknown })
    .localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => storedValues.get(key) ?? null,
      setItem: (key: string, value: string) => storedValues.set(key, value),
      removeItem: (key: string) => storedValues.delete(key),
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
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
  });

  const module =
    loadFreshModule<typeof import('../src/services/tokenService')>(tokenServiceModulePath);
  const listenerCalls: Array<string | null> = [];
  const unsubscribe = module.tokenService.subscribe((token) => listenerCalls.push(token));

  // A token stored before refresh tokens existed is read as it is.
  assert.equal(module.useAuthToken(), 'saved-token');
  assert.equal(module.tokenService.getRefreshToken(), null);

  const initialGeneration = module.tokenService.getGeneration();
  module.tokenService.setSession({ token: 'next-token', refreshToken: 'next-refresh' });
  assert.equal(module.useAuthToken(), 'next-token');
  assert.equal(module.tokenService.getRefreshToken(), 'next-refresh');
  assert.equal(module.useSessionExpired(), false);
  const signedInGeneration = module.tokenService.getGeneration();
  assert.notEqual(signedInGeneration, initialGeneration);

  // One refresh token keeps its attempt id until it is exchanged, also across a restart.
  const attemptId = module.tokenService.getRefreshAttemptId();
  assert.match(attemptId, /^[0-9a-f]{32}$/);
  assert.equal(module.tokenService.getRefreshAttemptId(), attemptId);
  assert.equal(storedValues.get('auth_refresh_attempt'), attemptId);

  // A refresh rotates the tokens within the same session.
  module.tokenService.replaceTokens({ token: 'rotated-token', refreshToken: 'rotated-refresh' });
  assert.equal(module.useAuthToken(), 'rotated-token');
  assert.equal(module.tokenService.getRefreshToken(), 'rotated-refresh');
  assert.equal(module.tokenService.getGeneration(), signedInGeneration);
  assert.notEqual(module.tokenService.getRefreshAttemptId(), attemptId);

  module.tokenService.expireSession();
  assert.notEqual(module.tokenService.getGeneration(), signedInGeneration);
  assert.equal(module.useAuthToken(), null);
  assert.equal(module.tokenService.getRefreshToken(), null);
  assert.equal(module.useSessionExpired(), true);

  // Signing in again hides the notice; signing out does not show it.
  module.tokenService.setSession({ token: 'third-token', refreshToken: 'third-refresh' });
  assert.equal(module.useSessionExpired(), false);
  module.tokenService.getRefreshAttemptId();
  module.tokenService.clearToken();
  assert.equal(module.useSessionExpired(), false);
  assert.deepEqual([...storedValues.keys()], []);
  unsubscribe();

  // Sign-outs waiting for the backend survive clearToken and are kept once each.
  module.tokenService.addPendingLogout('first-refresh');
  module.tokenService.addPendingLogout('second-refresh');
  module.tokenService.addPendingLogout('first-refresh');
  module.tokenService.clearToken();
  assert.deepEqual(module.tokenService.getPendingLogouts(), ['second-refresh', 'first-refresh']);
  module.tokenService.removePendingLogout('second-refresh');
  module.tokenService.removePendingLogout('first-refresh');
  assert.deepEqual(module.tokenService.getPendingLogouts(), []);
  assert.deepEqual([...storedValues.keys()], []);
  storedValues.set('auth_pending_logouts', 'not json');
  assert.deepEqual(module.tokenService.getPendingLogouts(), []);

  assert.deepEqual(listenerCalls, ['next-token', 'rotated-token', null, 'third-token', null]);
  storedValues.delete('auth_pending_logouts');
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
