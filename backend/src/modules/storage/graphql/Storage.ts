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
  @Query(() => SignedUploadUrl, {
    description:
      "A presigned `PUT` URL for uploading a CSV file straight to S3. The key is issued under the signed-in user's prefix.",
  })
  async signedUploadUrl(
    @Arg('input', () => SignedUploadRequest, { description: 'File name and optional MIME type.' })
    input: SignedUploadRequest,
    @Ctx() context: GraphQLContext
  ): Promise<SignedUploadUrl> {
    const user = await authFlow.me(context.req);
    return this.storage.getSignedUploadUrl(
      user._id.toString(),
      input.filename,
      input.mimeType || undefined
    );
  }

  @Query(() => SignedUploadUrl, {
    description:
      'A presigned `GET` URL for the dataset of a file record. Allowed for its uploader or a worker (service token).',
  })
  async signedDownloadUrl(
    @Arg('fileId', () => ID, { description: 'Id of the file record.' }) fileId: string,
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
