import { Arg, Ctx, ID, Query, Resolver } from 'type-graphql';
import { Types } from 'mongoose';
import { StorageClient } from '../services/StorageClient';
import { SignedUploadRequest } from '../classes/SignedUploadRequest';
import { SignedUploadUrl } from '../classes/SignedUploadUrl';
import { UploadedFileModel } from '../../files/models/UploadedFileModel';
import { AuthFlow } from '../../auth/services/AuthFlow';
import type { GraphQLContext } from '../../../types/context';

const authFlow = new AuthFlow();

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
  async signedDownloadUrl(
    @Arg('fileId', () => ID) fileId: string,
    @Ctx() context: GraphQLContext
  ): Promise<SignedUploadUrl> {
    const trimmedId = fileId.trim();
    if (!trimmedId) {
      throw new Error('File _id is required');
    }
    if (!Types.ObjectId.isValid(trimmedId)) {
      throw new Error('File _id is invalid');
    }

    const user = await authFlow.me(context.req);
    const file = await UploadedFileModel.findOne({
      _id: trimmedId,
      uploadedById: user?._id,
    }).lean();
    if (!file?.storageKey) {
      throw new Error('File not found');
    }

    return this.storage.getSignedDownloadUrl(file.storageKey);
  }
}
