import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Types } from 'mongoose';

import { stub, createLeanResult } from '../../test/testUtils';
import { AuthFlow } from '../auth/services/AuthFlow';
import { CreateUploadedFileInput } from './classes/CreateUploadedFileInput';
import { UploadedFile } from './classes/UploadedFile';
import { Files } from './graphql/Files';
import { UploadedFileModel, uploadedFilesCollectionName } from './models/UploadedFileModel';
import { FileStore, fileStore } from './services/FileStore';

test('uploaded file classes and model metadata are available', () => {
  const uploadedFile = new UploadedFile();
  const input = new CreateUploadedFileInput();
  const now = new Date();

  uploadedFile._id = new Types.ObjectId();
  uploadedFile.filename = 'dataset.csv';
  uploadedFile.sizeMb = 12;
  uploadedFile.status = 'uploaded';
  uploadedFile.uploadedAt = now;
  uploadedFile.uploadedByName = 'Ivan';
  uploadedFile.uploadedById = new Types.ObjectId();
  uploadedFile.storageKey = 'uploads/dataset.csv';

  input.filename = 'dataset.csv';
  input.storageKey = 'uploads/dataset.csv';
  input.sizeMb = 12;
  input.status = 'uploaded';

  assert.equal(uploadedFilesCollectionName, 'uploaded_files');
  assert.equal(UploadedFileModel.modelName, 'UploadedFile');
  assert.equal(input.filename, uploadedFile.filename);
});

test('FileStore.listByUser validates id and queries uploaded files', async (t) => {
  const store = new FileStore();
  const userId = new Types.ObjectId().toHexString();
  const files = [{ _id: new Types.ObjectId() }];
  const calls: any[] = [];

  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'find', (query: any) => {
    calls.push(query);
    return {
      sort(sortBy: any) {
        calls.push(sortBy);
        return {
          lean: async () => files,
        };
      },
    };
  });

  await assert.rejects(() => store.listByUser('bad-id'), /Invalid user id/);
  assert.equal(await store.listByUser(userId), files);
  assert.deepEqual(calls, [{ uploadedById: userId }, { uploadedAt: -1 }]);
});

test('FileStore.create validates and normalizes uploaded file data', async (t) => {
  const store = new FileStore();
  const uploadedById = new Types.ObjectId().toHexString();
  const createCalls: any[] = [];

  stub(
    t,
    UploadedFileModel as unknown as Record<string, unknown>,
    'create',
    async (payload: any) => {
      createCalls.push(payload);
      return {
        toObject: ({ getters }: { getters: boolean }) => ({ getters, ...payload }),
      };
    }
  );

  await assert.rejects(
    () => store.create({ filename: 'bad.txt', sizeMb: 1, storageKey: 'k' } as any),
    /Only CSV files are allowed/
  );

  const result: any = await store.create({
    filename: '  dataset.csv ',
    sizeMb: 5,
    status: ' uploaded ',
    storageKey: ' uploads/dataset.csv ',
    uploadedById,
    uploadedByName: ' Ivan ',
  });

  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].filename, 'dataset.csv');
  assert.equal(createCalls[0].storageKey, 'uploads/dataset.csv');
  assert.equal(createCalls[0].uploadedByName, 'Ivan');
  assert.ok(createCalls[0].uploadedById instanceof Types.ObjectId);
  assert.equal(result.getters, true);
});

test('FileStore.remove deletes storage object and db record', async (t) => {
  const store = new FileStore();
  const fileId = new Types.ObjectId().toHexString();
  const userId = new Types.ObjectId().toHexString();
  const deleteCalls: any[] = [];
  const storageCalls: any[] = [];
  const file = {
    _id: fileId,
    storageKey: 'uploads/dataset.csv',
  };

  stub(t, UploadedFileModel as unknown as Record<string, unknown>, 'findOne', () =>
    createLeanResult(file)
  );
  stub(
    t,
    UploadedFileModel as unknown as Record<string, unknown>,
    'deleteOne',
    async (...args: any[]) => {
      deleteCalls.push(args);
      return {};
    }
  );
  stub(t, store as unknown as Record<string, unknown>, 'getStorage', () => ({
    deleteObject: async (key: string) => {
      storageCalls.push(key);
    },
  }));

  assert.equal(await store.remove(fileId, userId), file);
  assert.deepEqual(storageCalls, ['uploads/dataset.csv']);
  assert.deepEqual(deleteCalls, [[{ _id: fileId }]]);
});

test('Files resolver delegates auth and file store operations', async (t) => {
  const resolver = new Files();
  const user = {
    _id: new Types.ObjectId(),
    name: 'Ivan',
    email: 'ivan@example.com',
  };
  const uploadedFiles = [{ _id: new Types.ObjectId() }];
  const createdFile = { _id: new Types.ObjectId() };
  const removedFile = { _id: new Types.ObjectId() };
  const listCalls: any[] = [];
  const createCalls: any[] = [];
  const removeCalls: any[] = [];

  stub(t, AuthFlow.prototype as unknown as Record<string, unknown>, 'me', async () => user);
  stub(t, fileStore as unknown as Record<string, unknown>, 'listByUser', async (...args: any[]) => {
    listCalls.push(args);
    return uploadedFiles;
  });
  stub(t, fileStore as unknown as Record<string, unknown>, 'create', async (...args: any[]) => {
    createCalls.push(args);
    return createdFile;
  });
  stub(t, fileStore as unknown as Record<string, unknown>, 'remove', async (...args: any[]) => {
    removeCalls.push(args);
    return removedFile;
  });

  assert.equal(await resolver.uploadedFiles({ req: {} } as any), uploadedFiles);
  assert.equal(
    await resolver.createUploadedFile(
      { filename: 'dataset.csv', storageKey: 'uploads/dataset.csv', sizeMb: 5 } as any,
      { req: {} } as any
    ),
    createdFile
  );
  assert.equal(await resolver.deleteUploadedFile('file-1', { req: {} } as any), removedFile);
  assert.deepEqual(listCalls, [[user._id.toString()]]);
  assert.equal(createCalls[0][0].uploadedById, user._id.toString());
  assert.equal(createCalls[0][0].uploadedByName, 'Ivan');
  assert.deepEqual(removeCalls, [['file-1', user._id.toString()]]);
});
