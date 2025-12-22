import { Arg, Query, Resolver } from 'type-graphql';
import { StorageClient } from '../services/StorageClient';
import { SignedUploadRequest } from '../classes/SignedUploadRequest';
import { SignedUploadUrl } from '../classes/SignedUploadUrl';

@Resolver()
export class Storage {
  private readonly storage = new StorageClient();

  @Query(() => SignedUploadUrl)
  async signedUploadUrl(
    @Arg('input', () => SignedUploadRequest) input: SignedUploadRequest
  ): Promise<SignedUploadUrl> {
    return this.storage.getSignedUploadUrl(input.filename, input.mimeType || undefined);
  }
}
