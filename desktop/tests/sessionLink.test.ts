import assert from 'node:assert/strict';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import {
  ApolloClient,
  ApolloError,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  Observable,
  execute,
  gql,
  type FetchResult,
} from '@apollo/client';

import { loadFreshModule, stubResolvedModule } from './testUtils';
import type { RefreshOutcome } from '../src/graphql/session';

const sessionLinkPath = path.resolve(__dirname, '../src/graphql/sessionLink');
const sessionPath = path.resolve(__dirname, '../src/graphql/session');
const tokenServicePath = path.resolve(__dirname, '../src/services/tokenService');
const SAVE = gql`
  mutation SaveExperiment {
    saveExperiment
  }
`;
const ME = gql`
  query Me {
    me {
      _id
    }
  }
`;
const unauthenticated: FetchResult = {
  errors: [{ message: 'jwt expired', extensions: { code: 'UNAUTHENTICATED' } }] as any,
};
const success: FetchResult = { data: { me: { _id: 'user-1' } } };

const loadLink = (t: TestContext) => {
  // The real session module is loaded, without the Vite-only config.
  stubResolvedModule(t, path.resolve(__dirname, '../src/graphql/session.js'), '../config/config', {
    config: { renderer: { graphqlEndpoint: 'http://backend/graphql' } },
  });
  return loadFreshModule<typeof import('../src/graphql/sessionLink')>(sessionLinkPath);
};

// Answers with the given results in turn and records the access token of every request.
const createBackend = (results: FetchResult[]) => {
  const tokens: string[] = [];
  let token = 'expired-access';
  const link = new ApolloLink(
    () =>
      new Observable<FetchResult>((observer) => {
        tokens.push(token);
        observer.next(results[Math.min(tokens.length - 1, results.length - 1)]);
        observer.complete();
      })
  );
  return {
    link,
    tokens,
    setToken: (next: string) => {
      token = next;
    },
  };
};

const run = (link: ApolloLink) =>
  new Promise<FetchResult>((resolve, reject) => {
    execute(link, { query: ME }).subscribe({ next: resolve, error: reject });
  });

test('an UNAUTHENTICATED error refreshes the session and retries the request once', async (t) => {
  const { createSessionLink } = loadLink(t);
  const backend = createBackend([unauthenticated, success]);
  let refreshes = 0;
  const refresh = async (): Promise<RefreshOutcome> => {
    refreshes += 1;
    backend.setToken('fresh-access');
    return 'refreshed';
  };

  const result = await run(ApolloLink.from([createSessionLink(refresh), backend.link]));

  assert.deepEqual(result, success);
  assert.equal(refreshes, 1);
  assert.deepEqual(backend.tokens, ['expired-access', 'fresh-access']);
});

test('requests that fail at the same time share one refresh', async (t) => {
  const { createSessionLink } = loadLink(t);
  let refreshes = 0;
  let pending: Promise<RefreshOutcome> | null = null;
  const refresh = () => {
    pending ??= new Promise<RefreshOutcome>((resolve) => {
      refreshes += 1;
      setTimeout(() => resolve('refreshed'), 5);
    });
    return pending;
  };
  const backends = [1, 2, 3].map(() => createBackend([unauthenticated, success]));

  const results = await Promise.all(
    backends.map((backend) => run(ApolloLink.from([createSessionLink(refresh), backend.link])))
  );

  assert.deepEqual(results, [success, success, success]);
  assert.equal(refreshes, 1);
});

test('a request that fails again after the retry is not refreshed again', async (t) => {
  const { createSessionLink } = loadLink(t);
  const backend = createBackend([unauthenticated]);
  let refreshes = 0;
  const refresh = async (): Promise<RefreshOutcome> => {
    refreshes += 1;
    return 'refreshed';
  };

  const result = await run(ApolloLink.from([createSessionLink(refresh), backend.link]));

  assert.equal(refreshes, 1);
  assert.equal(backend.tokens.length, 2);
  assert.equal(result.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
});

for (const outcome of ['expired', 'unavailable', 'superseded'] as const) {
  test(`a refresh that ends ${outcome} passes the original error on without a retry`, async (t) => {
    const { createSessionLink } = loadLink(t);
    const backend = createBackend([unauthenticated, success]);

    const result = await run(
      ApolloLink.from([createSessionLink(async () => outcome), backend.link])
    );

    assert.deepEqual(result, unauthenticated);
    assert.equal(backend.tokens.length, 1);
  });
}

test('a refresh that fails passes its error on instead of the expired token', async (t) => {
  const { createSessionLink } = loadLink(t);
  const backend = createBackend([unauthenticated, success]);
  const dropped = new TypeError('fetch failed');

  await assert.rejects(
    run(
      ApolloLink.from([
        createSessionLink(async () => {
          throw dropped;
        }),
        backend.link,
      ])
    ),
    (error) => error === dropped
  );
  assert.equal(backend.tokens.length, 1);
});

test('a request canceled while the refresh is pending is not sent again', async (t) => {
  const { createSessionLink } = loadLink(t);
  const backend = createBackend([unauthenticated, success]);
  let finish!: (outcome: RefreshOutcome) => void;
  let started!: () => void;
  const refreshing = new Promise<void>((resolve) => (started = resolve));
  const refresh = () =>
    new Promise<RefreshOutcome>((resolve) => {
      finish = resolve;
      started();
    });
  const received: unknown[] = [];

  const subscription = execute(ApolloLink.from([createSessionLink(refresh), backend.link]), {
    query: SAVE,
  }).subscribe({
    next: (result) => received.push(result),
    error: (error) => received.push(error),
    complete: () => received.push('complete'),
  });
  await refreshing;
  subscription.unsubscribe();
  finish('refreshed');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(backend.tokens.length, 1);
  assert.deepEqual(received, []);
});

test('other errors are not treated as an ended session', async (t) => {
  const { createSessionLink } = loadLink(t);
  const notFound: FetchResult = { errors: [{ message: 'Експеремент не знайдено' }] as any };
  const backend = createBackend([notFound]);
  let refreshes = 0;

  const result = await run(
    ApolloLink.from([
      createSessionLink(async () => {
        refreshes += 1;
        return 'refreshed';
      }),
      backend.link,
    ])
  );

  assert.deepEqual(result, notFound);
  assert.equal(refreshes, 0);
});

test('the refresh is asked for the session and token the request was sent with', async (t) => {
  const { createSessionLink } = loadLink(t);
  const backend = createBackend([unauthenticated, success]);
  const asked: unknown[][] = [];

  const result = await new Promise<FetchResult>((resolve, reject) => {
    execute(
      ApolloLink.from([
        createSessionLink(async (...args: unknown[]) => {
          asked.push(args);
          return 'superseded';
        }),
        backend.link,
      ]),
      { query: ME, context: { sessionGeneration: 3, sessionToken: 'account-a-access' } }
    ).subscribe({ next: resolve, error: reject });
  });

  assert.deepEqual(asked, [[3, 'account-a-access']]);
  // The user signed out or in meanwhile: the request is not repeated with someone else's token.
  assert.deepEqual(result, unauthenticated);
  assert.equal(backend.tokens.length, 1);
});

// A token service with sessions, like the real one: signIn starts a new generation.
const createTokens = () => {
  const state = { generation: 1, token: 'account-a' as string | null };
  return {
    state,
    service: { getGeneration: () => state.generation, getToken: () => state.token },
    signIn: (token: string) => {
      state.generation += 1;
      state.token = token;
    },
  };
};

// Answers with the given results in turn and records the Authorization header of every request.
const createRecordingBackend = (results: FetchResult[]) => {
  const authorizations: string[] = [];
  const link = new ApolloLink(
    (operation) =>
      new Observable<FetchResult>((observer) => {
        authorizations.push(operation.getContext().headers?.authorization);
        observer.next(results[Math.min(authorizations.length - 1, results.length - 1)]);
        observer.complete();
      })
  );
  return { link, authorizations };
};

test('the auth link sends the current access token and records its session', async (t) => {
  const { createAuthLink } = loadLink(t);
  const tokens = createTokens();
  const contexts: Record<string, unknown>[] = [];
  const capture = new ApolloLink((operation) => {
    contexts.push(operation.getContext());
    return Observable.of(success);
  });

  await new Promise<FetchResult>((resolve, reject) => {
    execute(ApolloLink.from([createAuthLink(tokens.service), capture]), {
      query: ME,
      context: { headers: { existing: 'header' } },
    }).subscribe({ next: resolve, error: reject });
  });

  assert.deepEqual(contexts[0].headers, { existing: 'header', authorization: 'Bearer account-a' });
  assert.equal(contexts[0].sessionGeneration, 1);
  assert.equal(contexts[0].sessionToken, 'account-a');
});

test('a retry within the same session is sent with the refreshed token', async (t) => {
  const { createAuthLink, createSessionLink } = loadLink(t);
  const tokens = createTokens();
  const backend = createRecordingBackend([unauthenticated, success]);
  const refresh = async (): Promise<RefreshOutcome> => {
    tokens.state.token = 'account-a-fresh';
    return 'refreshed';
  };

  const result = await run(
    ApolloLink.from([createSessionLink(refresh), createAuthLink(tokens.service), backend.link])
  );

  assert.deepEqual(result, success);
  assert.deepEqual(backend.authorizations, ['Bearer account-a', 'Bearer account-a-fresh']);
});

test('a retry is dropped when the session changes after the refresh succeeds', async (t) => {
  const { createAuthLink, createSessionLink } = loadLink(t);
  const tokens = createTokens();
  const backend = createRecordingBackend([unauthenticated, success]);
  const refresh = async (): Promise<RefreshOutcome> => {
    tokens.state.token = 'account-a-fresh';
    // Another account signs in after the refresh stored its tokens, before the retry is sent.
    queueMicrotask(() => tokens.signIn('account-b'));
    return 'refreshed';
  };

  const result = await run(
    ApolloLink.from([createSessionLink(refresh), createAuthLink(tokens.service), backend.link])
  );

  assert.deepEqual(backend.authorizations, ['Bearer account-a']);
  assert.deepEqual(result, unauthenticated);
});

// The real token service, refresh and HTTP link; only the transport is mocked. `respond` gets
// the operation name and how many times it was sent; throwing from it is a dropped connection.
const loadRealSession = (
  t: TestContext,
  respond: (operationName: string, attempt: number) => unknown
) => {
  const stored = new Map<string, string>();
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
  });
  t.after(() => {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  const requests: Array<[string, string | null]> = [];
  const transport = async (_url: unknown, init?: RequestInit) => {
    const { query } = JSON.parse(String(init?.body));
    const operationName = /(?:query|mutation) (\w+)/.exec(query)![1];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const authorization = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === 'authorization'
    );
    requests.push([operationName, authorization?.[1] || null]);
    const attempt = requests.filter(([name]) => name === operationName).length;
    return new Response(JSON.stringify(respond(operationName, attempt)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = transport as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
  });

  const { tokenService } =
    loadFreshModule<typeof import('../src/services/tokenService')>(tokenServicePath);
  stubResolvedModule(t, `${sessionPath}.js`, '../services/tokenService', { tokenService });
  stubResolvedModule(t, `${sessionPath}.js`, '../config/config', {
    config: { renderer: { graphqlEndpoint: 'http://backend/graphql' } },
  });
  const session = loadFreshModule<typeof import('../src/graphql/session')>(sessionPath);
  stubResolvedModule(t, `${sessionLinkPath}.js`, './session', session);
  const { createAuthLink, createSessionLink } =
    loadFreshModule<typeof import('../src/graphql/sessionLink')>(sessionLinkPath);
  const link = ApolloLink.from([
    createSessionLink(),
    createAuthLink(tokenService),
    new HttpLink({ uri: 'http://backend/graphql', fetch: transport as typeof fetch }),
  ]);
  return { tokenService, link, requests };
};

test('a mutation of one account is not replayed as the account that signed in meanwhile', async (t) => {
  const { tokenService, link, requests } = loadRealSession(t, (operationName, attempt) => {
    if (operationName === 'RefreshSession') {
      return { data: { refreshSession: { token: 'account-a-fresh', refreshToken: 'a-next' } } };
    }
    return attempt === 1 ? unauthenticated : { data: { saveExperiment: true } };
  });
  tokenService.setSession({ token: 'account-a', refreshToken: 'a-refresh' });
  // Account B signs in as soon as account A's refreshed tokens are stored.
  tokenService.subscribe((token) => {
    if (token === 'account-a-fresh') {
      queueMicrotask(() => tokenService.setSession({ token: 'account-b', refreshToken: 'b' }));
    }
  });

  const result = await new Promise<FetchResult>((resolve, reject) => {
    execute(link, { query: SAVE }).subscribe({ next: resolve, error: reject });
  });

  assert.deepEqual(requests, [
    ['SaveExperiment', 'Bearer account-a'],
    ['RefreshSession', null],
  ]);
  assert.equal(result.errors?.[0]?.extensions?.code, 'UNAUTHENTICATED');
  assert.equal(tokenService.getToken(), 'account-b');
});

test('a refresh that loses the connection shows the network error and keeps the session', async (t) => {
  const dropped = new TypeError('fetch failed');
  const { tokenService, link, requests } = loadRealSession(t, (operationName) => {
    if (operationName === 'RefreshSession') throw dropped;
    return unauthenticated;
  });
  tokenService.setSession({ token: 'account-a', refreshToken: 'a-refresh' });
  const client = new ApolloClient({ link, cache: new InMemoryCache() });

  const error = await client.mutate({ mutation: SAVE }).then(
    () => assert.fail('the mutation must fail'),
    (failure: unknown) => failure
  );

  // What the caller sees: the dropped connection, not the expired access token.
  assert.ok(error instanceof ApolloError);
  assert.equal(error.networkError, dropped);
  assert.deepEqual(error.graphQLErrors, []);
  assert.equal(error.message, 'fetch failed');
  assert.deepEqual(requests, [
    ['SaveExperiment', 'Bearer account-a'],
    ['RefreshSession', null],
  ]);
  // Still signed in: the refresh can be tried again once the connection is back.
  assert.equal(tokenService.getToken(), 'account-a');
  assert.equal(tokenService.getRefreshToken(), 'a-refresh');
});
