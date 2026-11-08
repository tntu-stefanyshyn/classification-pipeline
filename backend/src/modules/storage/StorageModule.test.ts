import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { Types } from 'mongoose';

import { config } from '../../config/config';
import { stub, createLeanResult } from '../../test/testUtils';
import { AuthFlow } from '../auth/services/AuthFlow';
import { UploadedFileModel } from '../files/models/UploadedFileModel';
import { Storage } from './graphql/Storage';
import { SignedUploadRequest } from './classes/SignedUploadRequest';
import { SignedUploadUrl } from './classes/SignedUploadUrl';
import { StorageClient } from './services/StorageClient';
import { buildUploadKey, isUploadKeyIssuedTo, uploadKeyPrefix } from './utils/uploadKeys';

const useS3Config = (t: TestContext, values: Partial<typeof config.s3>) => {
  const original = { ...config.s3 };
  Object.assign(config.s3, values);
  t.after(() => {
    Object.assign(config.s3, original);
  });
};

test('storage classes keep assigned values', () => {
  const request = new SignedUploadRequest();
  const url = new SignedUploadUrl();

  request.filename = 'dataset.csv';
  request.mimeType = 'text/csv';
  url.url = 'https://signed.example';
  url.key = 'uploads/dataset.csv';
  url.expiresIn = 900;

  assert.equal(request.filename, 'dataset.csv');
  assert.equal(url.key, 'uploads/dataset.csv');
});

test('StorageClient validates configuration and builds signed upload/download URLs', async (t) => {
  useS3Config(t, {
    bucket: '',
    region: '',
  });
  assert.throws(() => new StorageClient(), /S3 bucket and region must be configured/);

  Object.assign(config.s3, {
    bucket: 'uploads-bucket',
    region: 'eu-west-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    presignExpiresSeconds: 321,
  });

  const originalNow = Date.now;
  t.after(() => {
    Date.now = originalNow;
  });
  Date.now = () => 1700000000000;

  const client = new StorageClient();
  const userId = new Types.ObjectId().toHexString();
  const upload = await client.getSignedUploadUrl(userId, 'dataset.csv', 'text/csv');
  const download = await client.getSignedDownloadUrl('uploads/dataset.csv');

  assert.match(
    upload.key,
    new RegExp(`^uploads/${userId}/1700000000000-[0-9a-f]{12}-[0-9a-f]{32}-dataset\\.csv$`)
  );
  assert.equal(upload.expiresIn, 321);
  assert.equal(download.key, 'uploads/dataset.csv');
  assert.match(
    upload.url,
    new RegExp(`uploads-bucket\\.s3\\.eu-west-1\\.amazonaws\\.com/uploads/${userId}/1700000000000-`)
  );
  assert.match(upload.url, /X-Amz-Expires=321/);
  assert.match(
    download.url,
    /uploads-bucket\.s3\.eu-west-1\.amazonaws\.com\/uploads\/dataset\.csv/
  );
  assert.match(download.url, /X-Amz-Expires=321/);
  await assert.rejects(
    () => client.getSignedUploadUrl(userId, 'dataset.txt', 'text/plain'),
    /Only CSV files are allowed/
  );
  await assert.rejects(() => client.getSignedDownloadUrl('  '), /Storage key is required/);
});

test('StorageClient.deleteObject forwards command to the S3 client', async (t) => {
  useS3Config(t, {
    bucket: 'uploads-bucket',
    region: 'eu-west-1',
    accessKeyId: '',
    secretAccessKey: '',
    presignExpiresSeconds: 900,
  });

  const client = new StorageClient();
  const sendCalls: any[] = [];
  stub(t, client as unknown as Record<string, unknown>, 'client', {
    send: async (command: any) => {
      sendCalls.push(command.input);
      return {};
    },
  } as any);

  await client.deleteObject(' uploads/dataset.csv ');

  assert.deepEqual(sendCalls, [{ Bucket: 'uploads-bucket', Key: 'uploads/dataset.csv' }]);
});

test('Storage resolver delegates upload and download operations', async (t) => {
  useS3Config(t, {
    bucket: 'uploads-bucket',
    region: 'eu-west-1',
    accessKeyId: '',
    secretAccessKey: '',
    presignExpiresSeconds: 900,
  });

  const resolver = new Storage();
  const user = { _id: new Types.ObjectId() };
  const uploadResult = { url: 'https://upload', key: 'uploads/key.csv', expiresIn: 900 };
  const downloadResult = { url: 'https://download', key: 'uploads/key.csv', expiresIn: 900 };
  const signedCalls: any[] = [];

  stub(t, resolver as unknown as Record<string, unknown>, 'storage', {
    getSignedUploadUrl: async (...args: any[]) => {
      signedCalls.push(['upload', ...args]);
      return uploadResult;
    },
    getSignedDownloadUrl: async (...args: any[]) => {
      signedCalls.push(['download', ...args]);
      return downloadResult;
    },
  } as any);
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => user);
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult({ storageKey: 'uploads/key.csv' })
  );

  assert.equal(
    await resolver.signedUploadUrl(
      { filename: 'dataset.csv', mimeType: 'text/csv' } as any,
      {
        req: {},
      } as any
    ),
    uploadResult
  );
  await assert.rejects(
    () => resolver.signedDownloadUrl('bad-id', { req: {} } as any),
    /File _id is invalid/
  );

  const fileId = new Types.ObjectId().toHexString();
  assert.equal(await resolver.signedDownloadUrl(fileId, { req: {} } as any), downloadResult);
  assert.deepEqual(signedCalls, [
    ['upload', user._id.toString(), 'dataset.csv', 'text/csv'],
    ['download', 'uploads/key.csv'],
  ]);
});

test('Storage.signedDownloadUrl serves the compute service without a user filter', async (t) => {
  const original = config.backend.serviceToken;
  t.after(() => {
    config.backend.serviceToken = original;
  });
  config.backend.serviceToken = 'svc-token';
  useS3Config(t, {
    bucket: 'uploads-bucket',
    region: 'eu-west-1',
    accessKeyId: '',
    secretAccessKey: '',
    presignExpiresSeconds: 900,
  });

  const resolver = new Storage();
  const findOneArgs: any[] = [];
  stub(t, resolver as unknown as Record<string, unknown>, 'storage', {
    getSignedDownloadUrl: async () => ({ url: 'https://download', key: 'k', expiresIn: 900 }),
  } as any);
  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => {
    throw new Error('Not authenticated');
  });
  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findOne', (...args: any[]) => {
    findOneArgs.push(args[0]);
    return createLeanResult({ storageKey: 'uploads/key.csv' });
  });

  const fileId = new Types.ObjectId().toHexString();
  const context = { req: { headers: { authorization: 'Bearer svc-token' } } } as any;
  await resolver.signedDownloadUrl(fileId, context);
  assert.deepEqual(findOneArgs, [{ _id: fileId }]);
});

test('upload keys are issued under the user and recognised only for that user', () => {
  const userId = new Types.ObjectId().toHexString();
  const otherUserId = new Types.ObjectId().toHexString();

  const key = buildUploadKey(userId, 'data/../set.csv', 1700000000000);
  const second = buildUploadKey(userId, 'data/../set.csv', 1700000000000);

  assert.match(
    key,
    new RegExp(`^uploads/${userId}/1700000000000-[0-9a-f]{12}-[0-9a-f]{32}-data_.._set\\.csv$`)
  );
  // Two uploads of one file at the same moment still get different keys.
  assert.notEqual(second, key);
  assert.equal(isUploadKeyIssuedTo(key, userId), true);
  assert.equal(isUploadKeyIssuedTo(second, userId), true);
  assert.equal(isUploadKeyIssuedTo(key, otherUserId), false);
  // The same key moved under another user's prefix keeps a signature for the first user.
  assert.equal(isUploadKeyIssuedTo(key.replace(userId, otherUserId), otherUserId), false);
  assert.equal(isUploadKeyIssuedTo(`uploads/${userId}/`, userId), false);
  assert.equal(isUploadKeyIssuedTo(`uploads/${userId}/nested/key.csv`, userId), false);
  assert.equal(isUploadKeyIssuedTo('uploads/1700000000000-dataset.csv', userId), false);
  assert.equal(uploadKeyPrefix(userId), `uploads/${userId}/`);
});

test('a key the caller built or changed under its own prefix was not issued', () => {
  const userId = new Types.ObjectId().toHexString();
  const key = buildUploadKey(userId, 'set.csv', 1700000000000);
  const [, stamp, signature] = /\/(\d+-[0-9a-f]{12})-([0-9a-f]{32})-/.exec(key)!;
  const flip = (hex: string) => hex.slice(0, -1) + (hex.endsWith('0') ? '1' : '0');

  for (const forged of [
    // The format of the issued keys, without a signature the backend made.
    `${uploadKeyPrefix(userId)}1700000000000-abcdefabcdef-dataset.csv`,
    `${uploadKeyPrefix(userId)}1700000000000-abcdefabcdef-${'0'.repeat(32)}-dataset.csv`,
    // An issued key with any part changed.
    key.replace(signature, flip(signature)),
    key.replace(stamp, stamp.replace('1700000000000', '1700000000001')),
    key.replace('set.csv', 'other.csv'),
    key.toUpperCase(),
  ]) {
    assert.equal(isUploadKeyIssuedTo(forged, userId), false, forged);
  }
});
