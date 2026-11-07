import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { ApolloServer } from 'apollo-server-express';

import { createHttpApp } from './app';
import { config, toList } from './config/config';
import { Health } from './graphql/Health';
import { buildGraphqlSchema } from './test/graphqlTestUtils';

const startApp = async (t: TestContext) => {
  const apollo = new ApolloServer({ schema: buildGraphqlSchema([Health]) });
  await apollo.start();
  const app = createHttpApp(apollo, (_req, res) => {
    res.status(200).send('report');
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await apollo.stop();
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const preflight = (url: string, origin: string) =>
  fetch(url, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type',
    },
  });

test('CORS allows the desktop origins and no other, on GraphQL and on the report', async (t) => {
  const base = await startApp(t);

  for (const path of ['/graphql', '/experiments/abc/report']) {
    for (const origin of config.cors.origins) {
      const allowed = await preflight(`${base}${path}`, origin);
      assert.equal(allowed.headers.get('access-control-allow-origin'), origin, `${path} ${origin}`);
      assert.match(allowed.headers.get('access-control-allow-headers') ?? '', /authorization/);
    }
    const foreign = await preflight(`${base}${path}`, 'https://evil.example');
    assert.equal(foreign.headers.get('access-control-allow-origin'), null, path);
  }

  // A simple request from another origin is not readable either: Apollo adds no `*` of its own.
  const query = await fetch(`${base}/graphql?query=${encodeURIComponent('{ __typename }')}`, {
    headers: { origin: 'https://evil.example', 'apollo-require-preflight': 'true' },
  });
  assert.equal(query.headers.get('access-control-allow-origin'), null);
});

test('the default origins are the Vite dev server and the packaged desktop app', () => {
  assert.deepEqual(toList(undefined, ['a']), ['a']);
  assert.deepEqual(toList(' https://app.example , ,null ', ['a']), ['https://app.example', 'null']);
  assert.deepEqual(toList(' , ', ['a']), ['a']);
  if (!process.env.CORS_ORIGINS) {
    assert.deepEqual(config.cors.origins, ['http://localhost:5173', 'null']);
  }
});
