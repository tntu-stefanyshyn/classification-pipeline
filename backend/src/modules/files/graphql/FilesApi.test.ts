import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import {
  buildGraphqlSchema,
  createGraphqlContext,
  executeGraphql,
  toPlainValue,
} from '../../../test/graphqlTestUtils';
import { stub } from '../../../test/testUtils';
import { AuthFlow } from '../../auth/services/AuthFlow';
import { fileStore } from '../services/FileStore';
import { Files } from './Files';

test('Files GraphQL executes uploadedFiles and deleteUploadedFile via the schema', async (t) => {
  const schema = buildGraphqlSchema([Files]);
  const userId = new Types.ObjectId();
  const fileId = new Types.ObjectId();
  const calls: any[] = [];

  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => ({
    _id: userId,
    name: 'Tester',
    email: 'tester@example.com',
  }));
  stub(t, fileStore as unknown as Record<string, unknown>, 'listByUser', async (...args: any[]) => {
    calls.push(['listByUser', ...args]);
    return [
      {
        _id: fileId,
        filename: 'dataset.csv',
        sizeMb: 12,
        status: 'uploaded',
        uploadedByName: 'Tester',
      },
    ];
  });
  stub(t, fileStore as unknown as Record<string, unknown>, 'remove', async (...args: any[]) => {
    calls.push(['remove', ...args]);
    return {
      _id: fileId,
      filename: 'dataset.csv',
      sizeMb: 12,
      status: 'uploaded',
    };
  });

  const listResult = await executeGraphql(
    schema,
    `
      query UploadedFiles {
        uploadedFiles {
          _id
          filename
          sizeMb
          status
          uploadedByName
        }
      }
    `,
    {
      context: createGraphqlContext({ req: { headers: { authorization: 'Bearer token' } } as any }),
    }
  );
  const deleteResult = await executeGraphql(
    schema,
    `
      mutation DeleteFile($id: ID!) {
        deleteUploadedFile(_id: $id) {
          _id
          filename
        }
      }
    `,
    {
      variables: { id: fileId.toHexString() },
      context: createGraphqlContext({ req: { headers: { authorization: 'Bearer token' } } as any }),
    }
  );

  assert.equal(listResult.errors, undefined);
  assert.deepEqual(toPlainValue(listResult.data), {
    uploadedFiles: [
      {
        _id: fileId.toHexString(),
        filename: 'dataset.csv',
        sizeMb: 12,
        status: 'uploaded',
        uploadedByName: 'Tester',
      },
    ],
  });
  assert.equal(deleteResult.errors, undefined);
  assert.deepEqual(toPlainValue(deleteResult.data), {
    deleteUploadedFile: {
      _id: fileId.toHexString(),
      filename: 'dataset.csv',
    },
  });
  assert.deepEqual(calls, [
    ['listByUser', userId.toHexString()],
    ['remove', fileId.toHexString(), userId.toHexString()],
  ]);
});

test('Files GraphQL createUploadedFile tolerates missing auth and forwards normalized payload', async (t) => {
  const schema = buildGraphqlSchema([Files]);
  const fileId = new Types.ObjectId();
  const calls: any[] = [];

  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => {
    throw new Error('unauthorized');
  });
  stub(t, fileStore as unknown as Record<string, unknown>, 'create', async (...args: any[]) => {
    calls.push(['create', ...args]);
    return {
      _id: fileId,
      filename: 'dataset.csv',
      sizeMb: 4,
      status: 'uploaded',
    };
  });

  const result = await executeGraphql(
    schema,
    `
      mutation CreateUploadedFile($input: CreateUploadedFileInput!) {
        createUploadedFile(input: $input) {
          _id
          filename
          sizeMb
          status
        }
      }
    `,
    {
      variables: {
        input: {
          filename: 'dataset.csv',
          storageKey: 'uploads/dataset.csv',
          sizeMb: 4,
        },
      },
      context: createGraphqlContext({ req: { headers: {} } as any }),
    }
  );

  assert.equal(result.errors, undefined);
  assert.deepEqual(toPlainValue(result.data), {
    createUploadedFile: {
      _id: fileId.toHexString(),
      filename: 'dataset.csv',
      sizeMb: 4,
      status: 'uploaded',
    },
  });
  assert.deepEqual(toPlainValue(calls), [
    [
      'create',
      {
        filename: 'dataset.csv',
        storageKey: 'uploads/dataset.csv',
        sizeMb: 4,
      },
    ],
  ]);
});
