import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildAppSchema } from './schema';

test('buildAppSchema registers the application queries and mutations', () => {
  const schema = buildAppSchema();

  assert.ok(schema.getQueryType()?.getFields().health);
  assert.ok(schema.getMutationType()?.getFields().login);
  assert.ok(schema.getType('User'));
});
