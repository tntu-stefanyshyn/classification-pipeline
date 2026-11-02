import assert from 'node:assert/strict';
import path from 'node:path';
import { test, type TestContext } from 'node:test';

import { loadFreshModule, stub, stubResolvedModule } from './testUtils';

const sessionPath = path.resolve(__dirname, '../src/graphql/session');

type FetchCall = { headers: Record<string, string>; query: string; variables: unknown };

const loadSession = (
  t: TestContext,
  respond: (call: FetchCall) => Promise<unknown>,
  stored: { refreshToken: string | null }
) => {
  const calls: FetchCall[] = [];
  const tokenCalls: unknown[][] = [];
  stub(t, globalThis as any, 'fetch', (async (_url: string, init: RequestInit) => {
    const { query, variables } = JSON.parse(String(init.body));
    const call = { headers: init.headers as Record<string, string>, query, variables };
    calls.push(call);
    const body = await respond(call);
    return { json: async () => body };
  }) as any);
  stubResolvedModule(t, `${sessionPath}.js`, '../config/config', {
    config: { renderer: { graphqlEndpoint: 'http://backend/graphql' } },
  });
  stubResolvedModule(t, `${sessionPath}.js`, '../services/tokenService', {
    tokenService: {
      getRefreshToken: () => stored.refreshToken,
      setSession: (session: unknown) => tokenCalls.push(['setSession', session]),
      expireSession: () => tokenCalls.push(['expireSession']),
      clearToken: () => tokenCalls.push(['clearToken']),
    },
  });
  const module = loadFreshModule<typeof import('../src/graphql/session')>(sessionPath);
  return { module, calls, tokenCalls };
};

const unauthenticated = {
  data: null,
  errors: [{ message: 'Session expired', extensions: { code: 'UNAUTHENTICATED' } }],
};

test('refreshSession stores the rotated pair and sends no access token', async (t) => {
  const { module, calls, tokenCalls } = loadSession(
    t,
    async () => ({
      data: { refreshSession: { token: 'new-access', refreshToken: 'new-refresh' } },
    }),
    { refreshToken: 'old-refresh' }
  );

  assert.equal(await module.refreshSession(), 'refreshed');

  assert.equal(calls.length, 1);
  assert.match(calls[0].query, /refreshSession\(refreshToken: \$refreshToken\)/);
  assert.deepEqual(calls[0].variables, { refreshToken: 'old-refresh' });
  assert.deepEqual(calls[0].headers, { 'content-type': 'application/json' });
  assert.deepEqual(tokenCalls, [
    ['setSession', { token: 'new-access', refreshToken: 'new-refresh' }],
  ]);
});

test('requests that fail together share one refresh call', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { module, calls } = loadSession(
    t,
    async () => {
      await gate;
      return { data: { refreshSession: { token: 'a', refreshToken: 'r' } } };
    },
    { refreshToken: 'old-refresh' }
  );

  const pending = [module.refreshSession(), module.refreshSession(), module.refreshSession()];
  release();

  assert.deepEqual(await Promise.all(pending), ['refreshed', 'refreshed', 'refreshed']);
  assert.equal(calls.length, 1);
  // A later failure starts a new refresh.
  await module.refreshSession();
  assert.equal(calls.length, 2);
});

test('a rejected refresh token ends the session', async (t) => {
  const { module, tokenCalls } = loadSession(t, async () => unauthenticated, {
    refreshToken: 'revoked',
  });

  assert.equal(await module.refreshSession(), 'expired');
  assert.deepEqual(tokenCalls, [['expireSession']]);
});

test('a session without a refresh token ends without calling the backend', async (t) => {
  const { module, calls, tokenCalls } = loadSession(t, async () => ({}), { refreshToken: null });

  assert.equal(await module.refreshSession(), 'expired');
  assert.equal(calls.length, 0);
  assert.deepEqual(tokenCalls, [['expireSession']]);
});

test('a network failure or a server error keeps the session', async (t) => {
  const responses = [
    async () => {
      throw new TypeError('fetch failed');
    },
    async () => ({ data: null, errors: [{ message: 'Internal server error' }] }),
  ];
  let index = 0;
  const { module, tokenCalls } = loadSession(t, () => responses[index++](), {
    refreshToken: 'still-valid',
  });

  assert.equal(await module.refreshSession(), 'unavailable');
  assert.equal(await module.refreshSession(), 'unavailable');
  assert.deepEqual(tokenCalls, []);
});

test('endSession signs out locally first and then revokes the session', async (t) => {
  const order: string[] = [];
  const { module, calls, tokenCalls } = loadSession(
    t,
    async () => {
      order.push(`fetch after ${tokenCalls.length} token change(s)`);
      return { data: { logout: true } };
    },
    { refreshToken: 'current-refresh' }
  );

  await module.endSession();

  assert.deepEqual(tokenCalls, [['clearToken']]);
  assert.deepEqual(order, ['fetch after 1 token change(s)']);
  assert.match(calls[0].query, /logout\(refreshToken: \$refreshToken\)/);
  assert.deepEqual(calls[0].variables, { refreshToken: 'current-refresh' });
});

test('endSession works offline', async (t) => {
  const { module, tokenCalls } = loadSession(
    t,
    async () => {
      throw new TypeError('fetch failed');
    },
    { refreshToken: 'current-refresh' }
  );

  await module.endSession();

  assert.deepEqual(tokenCalls, [['clearToken']]);
});
