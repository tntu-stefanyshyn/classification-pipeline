import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGraphqlSchema, executeGraphql, toPlainValue } from '../test/graphqlTestUtils';
import { stub } from '../test/testUtils';
import { ServerInfoApi } from './ServerInfo';

test('ServerInfo GraphQL returns version from environment', async () => {
  const previousVersion = process.env.npm_package_version;
  process.env.npm_package_version = '1.2.3-test';

  try {
    const schema = buildGraphqlSchema([ServerInfoApi]);

    const result = await executeGraphql(
      schema,
      `
        query ServerInfo {
          serverInfo {
            version
            status
            uptimeSeconds
          }
        }
      `
    );

    assert.equal(result.errors, undefined);
    assert.deepEqual(toPlainValue(result.data), {
      serverInfo: {
        version: '1.2.3-test',
        status: 'ok',
        uptimeSeconds: 0,
      },
    });
  } finally {
    if (previousVersion === undefined) {
      delete process.env.npm_package_version;
    } else {
      process.env.npm_package_version = previousVersion;
    }
  }
});

test('ServerInfoApi falls back to dev version and computes uptime in seconds', (t) => {
  const previousVersion = process.env.npm_package_version;
  delete process.env.npm_package_version;

  const now = Date.now();
  const api = new ServerInfoApi();

  stub(t, api as unknown as Record<string, unknown>, 'startedAt', now - 3_250);

  try {
    const result = api.serverInfo();

    assert.deepEqual(result, {
      version: 'dev',
      status: 'ok',
      uptimeSeconds: 3,
    });
  } finally {
    if (previousVersion === undefined) {
      delete process.env.npm_package_version;
    } else {
      process.env.npm_package_version = previousVersion;
    }
  }
});
