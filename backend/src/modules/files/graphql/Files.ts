import { Arg, Ctx, ID, Mutation, Query, Resolver } from 'type-graphql';
import { UploadedFile } from '../classes/UploadedFile';
import { CreateUploadedFileInput } from '../classes/CreateUploadedFileInput';
import { fileStore } from '../services/FileStore';
import { AuthFlow } from '../../auth/services/AuthFlow';
import type { GraphQLContext } from '../../../types/context';

const authFlow = new AuthFlow();

@Resolver()
export class Files {
  @Query(() => [UploadedFile])
  uploadedFiles(): Promise<UploadedFile[]> {
    return fileStore.list();
  }

  @Mutation(() => UploadedFile)
  async createUploadedFile(
    @Arg('input', () => CreateUploadedFileInput) input: CreateUploadedFileInput,
    @Ctx() context: GraphQLContext
  ): Promise<UploadedFile> {
    const user = await authFlow.me(context.req).catch(() => null);
    return fileStore.create({
      ...input,
      uploadedById: user?._id?.toString(),
      uploadedByName: user?.name?.trim() || user?.email?.trim() || undefined,
    });
  }

  @Mutation(() => UploadedFile)
  deleteUploadedFile(@Arg('_id', () => ID) _id: string): Promise<UploadedFile> {
    return fileStore.remove(_id);
  }
}
