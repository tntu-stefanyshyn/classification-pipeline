import { StorageClient } from '../../storage/services/StorageClient';
import { UploadedFile } from '../classes/UploadedFile';
import { UploadedFileModel } from '../models/UploadedFileModel';

type CreateFileInput = {
  filename: string;
  sizeMb: number;
  status?: string;
  storageKey: string;
};

export class FileStore {
  private storage?: StorageClient;

  async list(): Promise<UploadedFile[]> {
    return UploadedFileModel.find().sort({ uploadedAt: -1 }).lean();
  }

  async create(input: CreateFileInput): Promise<UploadedFile> {
    const filename = input.filename.trim();
    if (!filename) throw new Error('Filename is required');
    if (!filename.toLowerCase().endsWith('.csv')) {
      throw new Error('Only CSV files are allowed');
    }
    const storageKey = input.storageKey?.trim();
    if (!storageKey) throw new Error('Storage key is required');
    if (input.sizeMb <= 0) throw new Error('sizeMb must be positive');

    const status = input.status?.trim();
    const file = await UploadedFileModel.create({
      filename,
      storageKey,
      sizeMb: input.sizeMb,
      status: status || undefined,
      uploadedAt: new Date(),
    });

    return file.toObject({ getters: true });
  }

  async remove(_id: string): Promise<UploadedFile> {
    const trimmedId = _id.trim();
    if (!trimmedId) throw new Error('File _id is required');

    const file = await UploadedFileModel.findById(trimmedId).lean();
    if (!file) {
      throw new Error('File not found');
    }
    if (!file.storageKey) {
      throw new Error('Storage key is missing for file');
    }

    await this.getStorage().deleteObject(file.storageKey);
    await UploadedFileModel.deleteOne({ _id: trimmedId });
    return file;
  }

  private getStorage(): StorageClient {
    if (!this.storage) {
      this.storage = new StorageClient();
    }
    return this.storage;
  }
}

export const fileStore = new FileStore();
