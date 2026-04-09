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
  const upload = await client.getSignedUploadUrl('dataset.csv', 'text/csv');
  const download = await client.getSignedDownloadUrl('uploads/dataset.csv');

  assert.equal(upload.key, 'uploads/1700000000000-dataset.csv');
  assert.equal(upload.expiresIn, 321);
  assert.equal(download.key, 'uploads/dataset.csv');
  assert.match(
    upload.url,
    /uploads-bucket\.s3\.eu-west-1\.amazonaws\.com\/uploads\/1700000000000-dataset\.csv/
  );
  assert.match(upload.url, /X-Amz-Expires=321/);
  assert.match(
    download.url,
    /uploads-bucket\.s3\.eu-west-1\.amazonaws\.com\/uploads\/dataset\.csv/
  );
  assert.match(download.url, /X-Amz-Expires=321/);
  await assert.rejects(
    () => client.getSignedUploadUrl('dataset.txt', 'text/plain'),
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
    await resolver.signedUploadUrl({ filename: 'dataset.csv', mimeType: 'text/csv' } as any),
    uploadResult
  );
  await assert.rejects(
    () => resolver.signedDownloadUrl('bad-id', { req: {} } as any),
    /File _id is invalid/
  );

  const fileId = new Types.ObjectId().toHexString();
  assert.equal(await resolver.signedDownloadUrl(fileId, { req: {} } as any), downloadResult);
  assert.deepEqual(signedCalls, [
    ['upload', 'dataset.csv', 'text/csv'],
    ['download', 'uploads/key.csv'],
  ]);
});
