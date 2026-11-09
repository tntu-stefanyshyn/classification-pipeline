import assert from 'node:assert/strict';
import path from 'node:path';
import { test, type TestContext } from 'node:test';

import { loadFreshModule, stub, stubResolvedModule } from './testUtils';

const sessionPath = path.resolve(__dirname, '../src/graphql/session');

type FetchCall = { headers: Record<string, string>; query: string; variables: unknown };

// A token service with sessions: signIn and signOut start a new generation, like the real one.
const createTokens = (refreshToken: string | null) => {
  const state = {
    generation: 1,
    token: 'access-1' as string | null,
    refreshToken,
    // Like the real one: kept until the exchange succeeds or the session changes.
    attemptId: null as string | null,
    pendingLogouts: [] as string[],
  };
  let attempts = 0;
  const calls: unknown[][] = [];
  return {
    state,
    calls,
    service: {
      getGeneration: () => state.generation,
      getToken: () => state.token,
      getRefreshToken: () => state.refreshToken,
      getRefreshAttemptId: () => (state.attemptId ??= `attempt-${++attempts}`),
      replaceTokens: (session: { token: string; refreshToken: string }) => {
        calls.push(['replaceTokens', session]);
        state.token = session.token;
        state.refreshToken = session.refreshToken;
        state.attemptId = null;
      },
      expireSession: () => {
        calls.push(['expireSession']);
        state.generation += 1;
        state.token = state.refreshToken = state.attemptId = null;
      },
      clearToken: () => {
        calls.push(['clearToken']);
        state.generation += 1;
        state.token = state.refreshToken = state.attemptId = null;
      },
      getPendingLogouts: () => [...state.pendingLogouts],
      addPendingLogout: (token: string) => {
        calls.push(['addPendingLogout', token]);
        state.pendingLogouts.push(token);
      },
      removePendingLogout: (token: string) => {
        calls.push(['removePendingLogout', token]);
        state.pendingLogouts = state.pendingLogouts.filter((pending) => pending !== token);
      },
    },
    signIn: (token: string, nextRefreshToken: string) => {
      state.generation += 1;
      state.token = token;
      state.refreshToken = nextRefreshToken;
      state.attemptId = null;
    },
  };
};

const loadSession = (
  t: TestContext,
  respond: (call: FetchCall) => Promise<unknown>,
  tokens: ReturnType<typeof createTokens>
) => {
  const calls: FetchCall[] = [];
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
    tokenService: tokens.service,
  });
  const module = loadFreshModule<typeof import('../src/graphql/session')>(sessionPath);
  return { module, calls };
};

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
};

const refreshed = (token: string, refreshToken: string) => ({
  data: { refreshSession: { token, refreshToken } },
});
const unauthenticated = {
  data: null,
  errors: [{ message: 'Session expired', extensions: { code: 'UNAUTHENTICATED' } }],
};

test('refreshSession sends the generated document and rotates the tokens', async (t) => {
  const tokens = createTokens('old-refresh');
  const { module, calls } = loadSession(
    t,
    async () => refreshed('new-access', 'new-refresh'),
    tokens
  );

  assert.equal(await module.refreshSession(), 'refreshed');

  assert.equal(calls.length, 1);
  assert.match(
    calls[0].query,
    /mutation RefreshSession\(\$refreshToken: String!, \$attemptId: String\)/
  );
  assert.deepEqual(calls[0].variables, { refreshToken: 'old-refresh', attemptId: 'attempt-1' });
  // No access token: the refresh must work after it expired.
  assert.deepEqual(calls[0].headers, { 'content-type': 'application/json' });
  assert.deepEqual(tokens.calls, [
    ['replaceTokens', { token: 'new-access', refreshToken: 'new-refresh' }],
  ]);
  // A refresh keeps the session: requests of this session can still be retried.
  assert.equal(tokens.state.generation, 1);
});

test('requests that fail together share one refresh call', async (t) => {
  const answer = deferred<unknown>();
  const tokens = createTokens('old-refresh');
  const { module, calls } = loadSession(t, () => answer.promise, tokens);

  const pending = [module.refreshSession(1, 'access-1'), module.refreshSession(1, 'access-1')];
  answer.resolve(refreshed('a', 'r'));

  assert.deepEqual(await Promise.all(pending), ['refreshed', 'refreshed']);
  assert.equal(calls.length, 1);
});

test('a request sent with an access token that was refreshed since is only retried', async (t) => {
  const tokens = createTokens('current-refresh');
  const { module, calls } = loadSession(t, async () => refreshed('x', 'y'), tokens);

  assert.equal(await module.refreshSession(1, 'access-before-the-refresh'), 'refreshed');
  assert.equal(calls.length, 0);
});

test('a rejected refresh token ends the session', async (t) => {
  const tokens = createTokens('revoked');
  const { module } = loadSession(t, async () => unauthenticated, tokens);

  assert.equal(await module.refreshSession(), 'expired');
  assert.deepEqual(tokens.calls, [['expireSession']]);
});

test('a session without a refresh token ends without calling the backend', async (t) => {
  const tokens = createTokens(null);
  const { module, calls } = loadSession(t, async () => ({}), tokens);

  assert.equal(await module.refreshSession(), 'expired');
  assert.equal(calls.length, 0);
  assert.deepEqual(tokens.calls, [['expireSession']]);
});

test('a network failure rejects with its error and keeps the session', async (t) => {
  const dropped = new TypeError('fetch failed');
  const tokens = createTokens('still-valid');
  const { module, calls } = loadSession(
    t,
    async () => {
      throw dropped;
    },
    tokens
  );

  const failing = [module.refreshSession(1, 'access-1'), module.refreshSession(1, 'access-1')];

  // Every request waiting for the refresh gets the same error, and the next refresh tries again.
  for (const refresh of failing) await assert.rejects(refresh, (error) => error === dropped);
  await assert.rejects(module.refreshSession(), (error) => error === dropped);
  assert.equal(calls.length, 2);
  assert.deepEqual(tokens.calls, []);
  assert.equal(tokens.state.refreshToken, 'still-valid');
});

test('a refresh whose answer was lost is repeated as the same attempt', async (t) => {
  const answers = [
    async () => {
      throw new TypeError('fetch failed');
    },
    async () => refreshed('new-access', 'new-refresh'),
    async () => refreshed('third-access', 'third-refresh'),
  ];
  let index = 0;
  const tokens = createTokens('old-refresh');
  const { module, calls } = loadSession(t, () => answers[index++](), tokens);

  await assert.rejects(module.refreshSession(), TypeError);
  assert.equal(await module.refreshSession(), 'refreshed');
  // The backend may have rotated the token before the answer was lost: the same id gets the same
  // new tokens back instead of being treated as reuse.
  assert.deepEqual(calls[1].variables, calls[0].variables);
  assert.deepEqual(calls[0].variables, { refreshToken: 'old-refresh', attemptId: 'attempt-1' });

  // The new refresh token is exchanged in a new attempt.
  assert.equal(await module.refreshSession(), 'refreshed');
  assert.deepEqual(calls[2].variables, { refreshToken: 'new-refresh', attemptId: 'attempt-2' });
});

test('a server error keeps the session', async (t) => {
  const tokens = createTokens('still-valid');
  const { module } = loadSession(
    t,
    async () => ({ data: null, errors: [{ message: 'Internal server error' }] }),
    tokens
  );

  assert.equal(await module.refreshSession(), 'unavailable');
  assert.deepEqual(tokens.calls, []);
});

test('a refresh answered after sign-out does not sign the user back in', async (t) => {
  const answer = deferred<unknown>();
  const tokens = createTokens('old-refresh');
  const { module } = loadSession(t, () => answer.promise, tokens);

  const refreshing = module.refreshSession();
  // endSession signs out synchronously; its Logout call is answered with the same late response.
  const ending = module.endSession();
  answer.resolve(refreshed('late-access', 'late-refresh'));
  await ending;

  assert.equal(await refreshing, 'superseded');
  assert.equal(tokens.state.token, null);
  assert.equal(tokens.state.refreshToken, null);
});

test('a refresh answered after another sign-in keeps the new account', async (t) => {
  const answer = deferred<unknown>();
  const tokens = createTokens('account-a-refresh');
  const { module } = loadSession(t, () => answer.promise, tokens);

  const refreshing = module.refreshSession();
  tokens.signIn('account-b-access', 'account-b-refresh');
  answer.resolve(refreshed('account-a-access', 'account-a-next'));

  assert.equal(await refreshing, 'superseded');
  assert.equal(tokens.state.token, 'account-b-access');
  assert.equal(tokens.state.refreshToken, 'account-b-refresh');
});

test('a rejection answered after another sign-in does not sign the new account out', async (t) => {
  const answer = deferred<unknown>();
  const tokens = createTokens('account-a-refresh');
  const { module } = loadSession(t, () => answer.promise, tokens);

  const refreshing = module.refreshSession();
  tokens.signIn('account-b-access', 'account-b-refresh');
  answer.resolve(unauthenticated);

  assert.equal(await refreshing, 'superseded');
  assert.deepEqual(tokens.calls, []);
  assert.equal(tokens.state.token, 'account-b-access');
});

test('a new session does not wait for the refresh of the previous one', async (t) => {
  const answers = [deferred<unknown>(), deferred<unknown>()];
  let index = 0;
  const tokens = createTokens('account-a-refresh');
  const { module, calls } = loadSession(t, () => answers[index++].promise, tokens);

  const previous = module.refreshSession();
  tokens.signIn('account-b-access', 'account-b-refresh');
  const current = module.refreshSession();
  answers[1].resolve(refreshed('account-b-next', 'account-b-next-refresh'));
  answers[0].resolve(refreshed('account-a-next', 'account-a-next-refresh'));

  assert.equal(await current, 'refreshed');
  assert.equal(await previous, 'superseded');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].variables, {
    refreshToken: 'account-b-refresh',
    attemptId: 'attempt-2',
  });
  assert.equal(tokens.state.token, 'account-b-next');
});

test('a request of a previous session is not refreshed', async (t) => {
  const tokens = createTokens('current-refresh');
  const { module, calls } = loadSession(t, async () => refreshed('x', 'y'), tokens);

  assert.equal(await module.refreshSession(0, 'access-0'), 'superseded');
  assert.equal(calls.length, 0);
});

test('endSession signs out locally first and keeps the revocation until the backend confirms it', async (t) => {
  const order: string[] = [];
  const tokens = createTokens('current-refresh');
  const { module, calls } = loadSession(
    t,
    async () => {
      order.push(`fetch after ${tokens.calls.length} token change(s)`);
      return { data: { logout: true } };
    },
    tokens
  );

  assert.equal(await module.endSession(), true);

  assert.deepEqual(tokens.calls, [
    ['addPendingLogout', 'current-refresh'],
    ['clearToken'],
    ['removePendingLogout', 'current-refresh'],
  ]);
  assert.deepEqual(order, ['fetch after 2 token change(s)']);
  assert.match(calls[0].query, /mutation Logout\(\$refreshToken: String!\)/);
  assert.deepEqual(calls[0].variables, { refreshToken: 'current-refresh' });
  assert.deepEqual(tokens.state.pendingLogouts, []);
});

test('a logout the backend did not confirm stays pending', async (t) => {
  const answers = [
    // Reachable, but the session was not revoked: its refresh token still works.
    async () => ({ data: null, errors: [{ message: 'Internal server error' }] }),
    async () => {
      throw new TypeError('fetch failed');
    },
  ];
  let index = 0;
  const tokens = createTokens('current-refresh');
  const { module, calls } = loadSession(t, () => answers[index++](), tokens);

  assert.equal(await module.endSession(), false);
  assert.equal(await module.revokePendingLogouts(), false);

  // Signed out locally either way; the token is kept only to revoke it later.
  assert.equal(tokens.state.token, null);
  assert.equal(tokens.state.refreshToken, null);
  assert.deepEqual(tokens.state.pendingLogouts, ['current-refresh']);
  assert.equal(calls.length, 2);
});

test('a pending logout is sent again until the backend confirms it', async (t) => {
  const tokens = createTokens(null);
  tokens.state.pendingLogouts = ['earlier-session', 'other-session'];
  const { module, calls } = loadSession(
    t,
    async (call) =>
      (call.variables as { refreshToken: string }).refreshToken === 'earlier-session'
        ? { data: { logout: true } }
        : { data: null, errors: [{ message: 'Internal server error' }] },
    tokens
  );

  assert.equal(await module.revokePendingLogouts(), false);

  assert.deepEqual(
    calls.map((call) => call.variables),
    [{ refreshToken: 'earlier-session' }, { refreshToken: 'other-session' }]
  );
  assert.deepEqual(tokens.state.pendingLogouts, ['other-session']);
});
