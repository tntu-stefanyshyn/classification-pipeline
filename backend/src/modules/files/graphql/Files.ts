import { Arg, Ctx, ID, Mutation, Query, Resolver } from 'type-graphql';
import { UploadedFile } from '../classes/UploadedFile';
import { UploadedFileUsage } from '../classes/UploadedFileUsage';
import { CreateUploadedFileInput } from '../classes/CreateUploadedFileInput';
import { fileStore } from '../services/FileStore';
import { AuthFlow } from '../../auth/services/AuthFlow';
import type { GraphQLContext } from '../../../types/context';

const authFlow = new AuthFlow();

@Resolver()
export class Files {
  @Query(() => [UploadedFile], { description: 'The files of the signed-in user, newest first.' })
  async uploadedFiles(@Ctx() context: GraphQLContext): Promise<UploadedFile[]> {
    const user = await authFlow.me(context.req);
    return fileStore.listByUser(user._id.toString());
  }

  @Mutation(() => UploadedFile, {
    description:
      'Registers a CSV file that was uploaded with a URL from `signedUploadUrl`. The key must have been issued to the caller and not be registered yet.',
  })
  async createUploadedFile(
    @Arg('input', () => CreateUploadedFileInput, {
      description: 'File name, S3 key, size and optional status.',
    })
    input: CreateUploadedFileInput,
    @Ctx() context: GraphQLContext
  ): Promise<UploadedFile> {
    // Not optional: a file is created for the signed-in user, from a key issued to them.
    const user = await authFlow.me(context.req);
    return fileStore.create({
      ...input,
      uploadedById: user._id.toString(),
      uploadedByName: user.name?.trim() || user.email?.trim() || undefined,
    });
  }

  @Query(() => UploadedFileUsage, {
    description:
      'The experiments that use a file and whether deleting it is blocked. Owner of the file only.',
  })
  async uploadedFileUsage(
    @Arg('_id', () => ID, { description: 'Id of the file.' }) _id: string,
    @Ctx() context: GraphQLContext
  ): Promise<UploadedFileUsage> {
    const user = await authFlow.me(context.req);
    return fileStore.getUsage(_id, user._id.toString());
  }

  @Mutation(() => UploadedFile, {
    description:
      'Deletes a file and its S3 object and detaches it from the experiments that use it. Refused while one of them is computing or optimizing, and until the owner confirms every own experiment that uses it in `detachExperimentIds`.',
  })
  async deleteUploadedFile(
    @Arg('_id', () => ID, { description: 'Id of the file.' }) _id: string,
    @Arg('detachExperimentIds', () => [ID], {
      nullable: true,
      description:
        "Ids of the caller's experiments that may be detached. It must list every own experiment that still uses the file (see `uploadedFileUsage`).",
    })
    detachExperimentIds: string[] | undefined,
    @Ctx() context: GraphQLContext
  ): Promise<UploadedFile> {
    const user = await authFlow.me(context.req);
    return fileStore.remove(_id, user._id.toString(), detachExperimentIds ?? []);
  }
}
