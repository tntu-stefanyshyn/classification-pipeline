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
import { ExperimentStatus } from '../../experiments/classes/ExperimentStatus';
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
    ['remove', fileId.toHexString(), userId.toHexString(), []],
  ]);
});

test('Files GraphQL exposes file usage and a confirmed delete via the schema', async (t) => {
  const schema = buildGraphqlSchema([Files]);
  const userId = new Types.ObjectId();
  const fileId = new Types.ObjectId();
  const experimentId = new Types.ObjectId();
  const calls: any[] = [];
  const context = createGraphqlContext({
    req: { headers: { authorization: 'Bearer token' } } as any,
  });

  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => ({
    _id: userId,
  }));
  stub(t, fileStore as unknown as Record<string, unknown>, 'getUsage', async (...args: any[]) => {
    calls.push(['getUsage', ...args]);
    return {
      experiments: [
        { _id: experimentId, name: 'Iris', status: ExperimentStatus.configuring, blocking: false },
      ],
      otherExperimentsCount: 1,
      blocked: false,
    };
  });
  stub(t, fileStore as unknown as Record<string, unknown>, 'remove', async (...args: any[]) => {
    calls.push(['remove', ...args]);
    return { _id: fileId, filename: 'dataset.csv', sizeMb: 1, status: 'uploaded' };
  });

  const usageResult = await executeGraphql(
    schema,
    `
      query Usage($id: ID!) {
        uploadedFileUsage(_id: $id) {
          experiments { _id name status blocking }
          otherExperimentsCount
          blocked
        }
      }
    `,
    { variables: { id: fileId.toHexString() }, context }
  );
  const deleteResult = await executeGraphql(
    schema,
    `
      mutation DeleteFile($id: ID!, $detach: [ID!]) {
        deleteUploadedFile(_id: $id, detachExperimentIds: $detach) { _id }
      }
    `,
    { variables: { id: fileId.toHexString(), detach: [experimentId.toHexString()] }, context }
  );

  assert.equal(usageResult.errors, undefined);
  assert.deepEqual(toPlainValue(usageResult.data), {
    uploadedFileUsage: {
      experiments: [
        { _id: experimentId.toHexString(), name: 'Iris', status: 'configuring', blocking: false },
      ],
      otherExperimentsCount: 1,
      blocked: false,
    },
  });
  assert.equal(deleteResult.errors, undefined);
  assert.deepEqual(calls, [
    ['getUsage', fileId.toHexString(), userId.toHexString()],
    ['remove', fileId.toHexString(), userId.toHexString(), [experimentId.toHexString()]],
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
