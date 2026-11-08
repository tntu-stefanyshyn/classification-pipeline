import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { Types } from 'mongoose';

import { config } from '../../../config/config';
import {
  buildGraphqlSchema,
  createGraphqlContext,
  executeGraphql,
  toPlainValue,
} from '../../../test/graphqlTestUtils';
import { createLeanResult, stub } from '../../../test/testUtils';
import { AuthFlow } from '../../auth/services/AuthFlow';
import { UploadedFileModel } from '../../files/models/UploadedFileModel';
import { StorageClient } from '../services/StorageClient';
import { isUploadKeyIssuedTo, uploadKeyPrefix } from '../utils/uploadKeys';
import { Storage } from './Storage';

const useS3Config = (t: TestContext) => {
  const original = { ...config.s3 };
  Object.assign(config.s3, {
    bucket: 'uploads-bucket',
    region: 'eu-west-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    presignExpiresSeconds: 900,
  });
  t.after(() => {
    Object.assign(config.s3, original);
  });
};

test('Storage GraphQL executes upload and download URL queries via the schema', async (t) => {
  useS3Config(t);
  const schema = buildGraphqlSchema([Storage]);
  const userId = new Types.ObjectId();
  const fileId = new Types.ObjectId();
  const calls: any[] = [];

  stub(
    t,
    StorageClient.prototype as unknown as Record<string, unknown>,
    'getSignedUploadUrl',
    async (...args: any[]) => {
      calls.push(['getSignedUploadUrl', ...args]);
      return {
        url: 'https://signed.example/upload',
        key: 'uploads/dataset.csv',
        expiresIn: 900,
      };
    }
  );
  stub(
    t,
    StorageClient.prototype as unknown as Record<string, unknown>,
    'getSignedDownloadUrl',
    async (...args: any[]) => {
      calls.push(['getSignedDownloadUrl', ...args]);
      return {
        url: 'https://signed.example/download',
        key: args[0],
        expiresIn: 900,
      };
    }
  );
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => ({
    _id: userId,
    email: 'tester@example.com',
  }));
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult({ storageKey: 'uploads/dataset.csv' })
  );

  const uploadResult = await executeGraphql(
    schema,
    `
      query SignedUploadUrl($input: SignedUploadRequest!) {
        signedUploadUrl(input: $input) {
          url
          key
          expiresIn
        }
      }
    `,
    {
      variables: {
        input: {
          filename: 'dataset.csv',
          mimeType: 'text/csv',
        },
      },
    }
  );
  const downloadResult = await executeGraphql(
    schema,
    `
      query SignedDownloadUrl($fileId: ID!) {
        signedDownloadUrl(fileId: $fileId) {
          url
          key
          expiresIn
        }
      }
    `,
    {
      variables: { fileId: fileId.toHexString() },
      context: createGraphqlContext({ req: { headers: { authorization: 'Bearer token' } } as any }),
    }
  );
  const invalidDownloadResult = await executeGraphql(
    schema,
    `
      query InvalidSignedDownloadUrl {
        signedDownloadUrl(fileId: "bad-id") {
          key
        }
      }
    `,
    {
      context: createGraphqlContext({ req: { headers: { authorization: 'Bearer token' } } as any }),
    }
  );

  assert.equal(uploadResult.errors, undefined);
  assert.deepEqual(toPlainValue(uploadResult.data), {
    signedUploadUrl: {
      url: 'https://signed.example/upload',
      key: 'uploads/dataset.csv',
      expiresIn: 900,
    },
  });
  assert.equal(downloadResult.errors, undefined);
  assert.deepEqual(toPlainValue(downloadResult.data), {
    signedDownloadUrl: {
      url: 'https://signed.example/download',
      key: 'uploads/dataset.csv',
      expiresIn: 900,
    },
  });
  assert.equal(invalidDownloadResult.data, null);
  assert.match(invalidDownloadResult.errors?.[0]?.message ?? '', /File _id is invalid/);
  assert.deepEqual(calls, [
    ['getSignedUploadUrl', userId.toHexString(), 'dataset.csv', 'text/csv'],
    ['getSignedDownloadUrl', 'uploads/dataset.csv'],
  ]);
});

test('Storage GraphQL signedUploadUrl requires a signed-in user and keys uploads by user', async (t) => {
  useS3Config(t);
  const schema = buildGraphqlSchema([Storage]);
  const query = `
    query SignedUploadUrl($input: SignedUploadRequest!) {
      signedUploadUrl(input: $input) { key }
    }
  `;
  const variables = { input: { filename: 'dataset.csv', mimeType: 'text/csv' } };

  // The real AuthFlow: without a token nothing is signed.
  const anonymous = await executeGraphql(schema, query, { variables });
  assert.equal(anonymous.data, null);
  assert.equal(anonymous.errors?.[0]?.message, 'Not authenticated');

  const userId = new Types.ObjectId();
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => ({
    _id: userId,
    email: 'tester@example.com',
  }));
  const signed = await executeGraphql(schema, query, { variables });

  assert.equal(signed.errors, undefined);
  const key: string = (signed.data as any).signedUploadUrl.key;
  assert.ok(key.startsWith(uploadKeyPrefix(userId.toHexString())), key);
  assert.match(key, /\/\d+-[0-9a-f]{12}-[0-9a-f]{32}-dataset\.csv$/);
  // createUploadedFile accepts exactly this key for this user.
  assert.equal(isUploadKeyIssuedTo(key, userId.toHexString()), true);
});
