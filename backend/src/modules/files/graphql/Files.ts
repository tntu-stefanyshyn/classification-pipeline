import { Arg, ID, Mutation, Query, Resolver } from 'type-graphql';
import { UploadedFile } from '../classes/UploadedFile';
import { CreateUploadedFileInput } from '../classes/CreateUploadedFileInput';
import { fileStore } from '../services/FileStore';

@Resolver()
export class Files {
  @Query(() => [UploadedFile])
  uploadedFiles(): UploadedFile[] {
    return fileStore.list();
  }

  @Mutation(() => UploadedFile)
  createUploadedFile(
    @Arg('input', () => CreateUploadedFileInput) input: CreateUploadedFileInput
  ): UploadedFile {
    return fileStore.create(input);
  }

  @Mutation(() => UploadedFile)
  deleteUploadedFile(@Arg('id', () => ID) id: string): UploadedFile {
    return fileStore.remove(id);
  }
}
