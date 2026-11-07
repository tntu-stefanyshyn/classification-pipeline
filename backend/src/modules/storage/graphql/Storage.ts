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

  /** Signed-in users only: the key is issued under the caller's uploads (see uploadKeys). */
  @Query(() => SignedUploadUrl)
  async signedUploadUrl(
    @Arg('input', () => SignedUploadRequest) input: SignedUploadRequest,
    @Ctx() context: GraphQLContext
  ): Promise<SignedUploadUrl> {
    const user = await authFlow.me(context.req);
    return this.storage.getSignedUploadUrl(
      user._id.toString(),
      input.filename,
      input.mimeType || undefined
    );
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

    const user = authFlow.isService(context.req) ? null : await authFlow.me(context.req);
    const file = await UploadedFileModel.findOne({
      _id: trimmedId,
      ...(user ? { uploadedById: user._id } : {}),
    }).lean();
    if (!file?.storageKey) {
      throw new Error('File not found');
    }

    return this.storage.getSignedDownloadUrl(file.storageKey);
  }
}
