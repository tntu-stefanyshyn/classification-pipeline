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
  async uploadedFiles(@Ctx() context: GraphQLContext): Promise<UploadedFile[]> {
    const user = await authFlow.me(context.req);
    return fileStore.listByUser(user._id.toString());
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
  async deleteUploadedFile(
    @Arg('_id', () => ID) _id: string,
    @Ctx() context: GraphQLContext
  ): Promise<UploadedFile> {
    const user = await authFlow.me(context.req);
    return fileStore.remove(_id, user._id.toString());
  }
}
