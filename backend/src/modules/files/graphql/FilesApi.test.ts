import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
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
import { uploadKeyPrefix } from '../../storage/utils/uploadKeys';
import { UploadedFileModel } from '../models/UploadedFileModel';
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

const CREATE_UPLOADED_FILE = `
  mutation CreateUploadedFile($input: CreateUploadedFileInput!) {
    createUploadedFile(input: $input) {
      _id
      filename
      sizeMb
    }
  }
`;

// The real resolver, AuthFlow and FileStore; only the collection is replaced.
const useUploadedFiles = (t: TestContext, existingKeys: string[] = []) => {
  const created: any[] = [];
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'exists', (async (query: any) =>
    existingKeys.includes(query.storageKey) ? { _id: new Types.ObjectId() } : null) as any);
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'create', (async (doc: any) => {
    created.push(doc);
    const record = { _id: new Types.ObjectId(), ...doc };
    return { toObject: () => record };
  }) as any);
  return created;
};

const signIn = (t: TestContext, user: { _id: Types.ObjectId; email: string; name?: string }) =>
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => user);

const createUploadedFile = (storageKey: string, headers: Record<string, string> = {}) =>
  executeGraphql(buildGraphqlSchema([Files]), CREATE_UPLOADED_FILE, {
    variables: { input: { filename: 'dataset.csv', storageKey, sizeMb: 4 } },
    context: createGraphqlContext({ req: { headers } as any }),
  });

test('Files GraphQL createUploadedFile requires a signed-in user', async (t) => {
  const created = useUploadedFiles(t);
  const userId = new Types.ObjectId().toHexString();

  const result = await createUploadedFile(uploadKeyPrefix(userId) + '1-abc-dataset.csv');

  assert.equal(result.data, null);
  assert.equal(result.errors?.[0]?.message, 'Not authenticated');
  // Before the fix this created a record without an owner.
  assert.deepEqual(created, []);
});

test('Files GraphQL createUploadedFile rejects a key that was not issued to the caller', async (t) => {
  const created = useUploadedFiles(t, []);
  const caller = { _id: new Types.ObjectId(), email: 'caller@example.com' };
  const otherUserId = new Types.ObjectId().toHexString();
  signIn(t, caller);

  for (const storageKey of [
    uploadKeyPrefix(otherUserId) + '1700000000000-abc-dataset.csv',
    'uploads/1700000000000-dataset.csv',
    `${uploadKeyPrefix(caller._id.toHexString())}nested/../dataset.csv`,
  ]) {
    const result = await createUploadedFile(storageKey, { authorization: 'Bearer token' });
    assert.equal(result.data, null, storageKey);
    assert.equal(result.errors?.[0]?.message, 'Storage key was not issued to this user');
  }
  assert.deepEqual(created, []);
});

test('Files GraphQL createUploadedFile registers an issued key once, for its owner', async (t) => {
  const caller = { _id: new Types.ObjectId(), name: ' Tester ', email: 'tester@example.com' };
  const storageKey = `${uploadKeyPrefix(caller._id.toHexString())}1700000000000-abc-dataset.csv`;
  const registered = `${uploadKeyPrefix(caller._id.toHexString())}1600000000000-def-dataset.csv`;
  const created = useUploadedFiles(t, [registered]);
  signIn(t, caller);

  const result = await createUploadedFile(storageKey, { authorization: 'Bearer token' });
  const again = await createUploadedFile(registered, { authorization: 'Bearer token' });

  assert.equal(result.errors, undefined);
  assert.equal((result.data as any).createUploadedFile.filename, 'dataset.csv');
  assert.equal(created.length, 1);
  assert.equal(created[0].storageKey, storageKey);
  assert.equal(String(created[0].uploadedById), caller._id.toHexString());
  assert.equal(created[0].uploadedByName, 'Tester');
  assert.equal(again.errors?.[0]?.message, 'File is already registered');
});
