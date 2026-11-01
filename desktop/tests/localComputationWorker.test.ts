import assert from 'node:assert/strict';
import path from 'node:path';
import { test, type TestContext } from 'node:test';

import { loadFreshModule, setEnv, stub, stubResolvedModule } from './testUtils';

const graphqlClientPath = path.resolve(__dirname, '../src/workers/localComputation/graphqlClient');
const workerPath = path.resolve(
  __dirname,
  '../src/workers/localComputation/LocalComputationWorker'
);

type FetchCall = { query: string; authorization?: string };

const stubGraphqlEndpoint = (t: TestContext, respond: (query: string) => unknown) => {
  const calls: FetchCall[] = [];
  stub(t, globalThis as any, 'fetch', (async (_url: string, init: RequestInit) => {
    const { query } = JSON.parse(String(init.body)) as { query: string };
    const headers = init.headers as Record<string, string>;
    calls.push({ query, authorization: headers.authorization });
    return { ok: true, status: 200, json: async () => ({ data: respond(query) }) };
  }) as any);
  return calls;
};

const loadWorkerModule = (t: TestContext, runPythonHandler: (...args: any[]) => Promise<null>) => {
  stubResolvedModule(t, `${graphqlClientPath}.js`, '../../config/config', {
    config: { renderer: { graphqlEndpoint: 'http://backend/graphql' } },
  });
  loadFreshModule(graphqlClientPath);
  stubResolvedModule(t, `${workerPath}.js`, 'electron', { app: { getVersion: () => '1.0.0' } });
  stubResolvedModule(t, `${workerPath}.js`, './pythonRunner', {
    runPythonHandler,
    warmupLocalDockerImage: async () => undefined,
  });
  return loadFreshModule<typeof import('../src/workers/localComputation/LocalComputationWorker')>(
    workerPath
  );
};

test('GraphqlClient sends the bearer token only when it has one', async (t) => {
  stubResolvedModule(t, `${graphqlClientPath}.js`, '../../config/config', {
    config: { renderer: { graphqlEndpoint: 'http://backend/graphql' } },
  });
  const { GraphqlClient, createGraphqlClient } =
    loadFreshModule<typeof import('../src/workers/localComputation/graphqlClient')>(
      graphqlClientPath
    );
  const calls = stubGraphqlEndpoint(t, () => ({ ok: true }));
  const document = { kind: 'Document', definitions: [] } as any;

  stub(t, console, 'log', () => undefined);
  await new GraphqlClient('http://backend/graphql').request(document);
  await createGraphqlClient('svc-token').request(document);

  assert.equal(calls[0]?.authorization, undefined);
  assert.equal(calls[1]?.authorization, 'Bearer svc-token');
});

test('LocalComputationWorker stays off without the service token', async (t) => {
  setEnv(t, 'BACKEND_SERVICE_TOKEN', '   ');
  const warnings: string[] = [];
  stub(t, console, 'warn', (message: string) => {
    warnings.push(message);
  });
  const calls = stubGraphqlEndpoint(t, () => ({ claimExperimentRun: null }));
  const { LocalComputationWorker } = loadWorkerModule(t, async () => null);

  new LocalComputationWorker().start();
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(calls.length, 0);
  assert.match(warnings[0] ?? '', /BACKEND_SERVICE_TOKEN/);
});

test('LocalComputationWorker authenticates its requests and the container with the service token', async (t) => {
  setEnv(t, 'BACKEND_SERVICE_TOKEN', ' svc-token ');
  setEnv(t, 'LOCAL_WORKER_POLL_MS', '1');
  setEnv(t, 'LOCAL_WORKER_STATUS_POLL_MS', '1');
  stub(t, console, 'log', () => undefined);

  let claims = 0;
  const calls = stubGraphqlEndpoint(t, (query) => {
    if (query.includes('claimExperimentRun')) {
      claims += 1;
      return {
        claimExperimentRun:
          claims === 1
            ? { _id: 'run-1', experimentId: 'exp-1', queue: 'local', pathNodeIds: ['node-1'] }
            : null,
      };
    }
    return {
      experiment: {
        _id: 'exp-1',
        fileId: 'file-1',
        graph: { nodes: [{ _id: 'node-1', stage: 'CLASSIFICATION', technology: 'svm' }] },
      },
    };
  });

  const handlerOptions: Array<{ backendToken?: string }> = [];
  const finished = new Promise<void>((resolve) => {
    const { LocalComputationWorker } = loadWorkerModule(t, async (_payload, options) => {
      handlerOptions.push(options);
      worker.stop();
      resolve();
      return null;
    });
    const worker = new LocalComputationWorker();
    worker.start();
  });
  await finished;

  assert.deepEqual(
    handlerOptions.map((options) => options.backendToken),
    ['svc-token']
  );
  assert.ok(calls.length >= 2);
  assert.deepEqual([...new Set(calls.map((call) => call.authorization))], ['Bearer svc-token']);
});
