import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { buildGraphqlSchema, executeGraphql, toPlainValue } from '../../../test/graphqlTestUtils';
import { stub } from '../../../test/testUtils';
import { TechnologyManager } from '../services/TechnologyManager';
import { Technologies } from './Technologies';

test('Technologies GraphQL executes the technologies query through the schema', async (t) => {
  const schema = buildGraphqlSchema([Technologies]);
  const technologyId = new Types.ObjectId();
  const calls: any[] = [];

  stub(
    t,
    TechnologyManager.prototype as unknown as Record<string, unknown>,
    'list',
    async (...args: any[]) => {
      calls.push(['list', ...args]);
      return [
        {
          _id: technologyId,
          name: 'SVM',
          stage: 'CLASSIFICATION',
          settings: [
            {
              key: 'kernel',
              label: 'Kernel',
              type: 'SELECT',
              required: true,
            },
          ],
        },
      ];
    }
  );

  const result = await executeGraphql(
    schema,
    `
      query Technologies {
        technologies {
          _id
          name
          stage
          settings {
            key
            label
            type
            required
          }
        }
      }
    `
  );

  assert.equal(result.errors, undefined);
  assert.deepEqual(toPlainValue(result.data), {
    technologies: [
      {
        _id: technologyId.toHexString(),
        name: 'SVM',
        stage: 'CLASSIFICATION',
        settings: [
          {
            key: 'kernel',
            label: 'Kernel',
            type: 'SELECT',
            required: true,
          },
        ],
      },
    ],
  });
  assert.deepEqual(calls, [['list']]);
});
