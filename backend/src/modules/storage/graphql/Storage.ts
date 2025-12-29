import { Arg, ID, Query, Resolver } from 'type-graphql';
import { Types } from 'mongoose';
import { StorageClient } from '../services/StorageClient';
import { SignedUploadRequest } from '../classes/SignedUploadRequest';
import { SignedUploadUrl } from '../classes/SignedUploadUrl';
import { UploadedFileModel } from '../../files/models/UploadedFileModel';

@Resolver()
export class Storage {
  private readonly storage = new StorageClient();

  @Query(() => SignedUploadUrl)
  async signedUploadUrl(
    @Arg('input', () => SignedUploadRequest) input: SignedUploadRequest
  ): Promise<SignedUploadUrl> {
    return this.storage.getSignedUploadUrl(input.filename, input.mimeType || undefined);
  }

  @Query(() => SignedUploadUrl)
  async signedDownloadUrl(@Arg('fileId', () => ID) fileId: string): Promise<SignedUploadUrl> {
    const trimmedId = fileId.trim();
    if (!trimmedId) {
      throw new Error('File _id is required');
    }
    if (!Types.ObjectId.isValid(trimmedId)) {
      throw new Error('File _id is invalid');
    }

    const file = await UploadedFileModel.findById(trimmedId).lean();
    if (!file?.storageKey) {
      throw new Error('File not found');
    }

    return this.storage.getSignedDownloadUrl(file.storageKey);
  }
}
