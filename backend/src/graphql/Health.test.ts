import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildGraphqlSchema, executeGraphql, toPlainValue } from '../test/graphqlTestUtils';
import { Health } from './Health';

test('Health GraphQL returns ok status', async () => {
  const schema = buildGraphqlSchema([Health]);

  const result = await executeGraphql(
    schema,
    `
      query Health {
        health
      }
    `
  );

  assert.equal(result.errors, undefined);
  assert.deepEqual(toPlainValue(result.data), {
    health: 'ok',
  });
});
