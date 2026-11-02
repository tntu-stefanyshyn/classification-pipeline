import assert from 'node:assert/strict';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import { ApolloLink, Observable, execute, gql, type FetchResult } from '@apollo/client';

import { loadFreshModule, stubResolvedModule } from './testUtils';
import type { RefreshOutcome } from '../src/graphql/session';

const sessionLinkPath = path.resolve(__dirname, '../src/graphql/sessionLink');
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

for (const outcome of ['expired', 'unavailable'] as const) {
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
