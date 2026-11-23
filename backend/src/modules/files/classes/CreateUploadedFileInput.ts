import { Field, InputType, Int } from 'type-graphql';

@InputType({ description: 'Registers a file that was uploaded to S3.' })
export class CreateUploadedFileInput {
  @Field({ description: 'Original file name; it must end with `.csv`.' })
  filename!: string;

  @Field({
    description:
      'The S3 key returned by `signedUploadUrl` for this user. A key that was not issued to the caller, or is already registered, is rejected.',
  })
  storageKey!: string;

  @Field(() => Int, { description: 'Size in megabytes, greater than 0.' })
  sizeMb!: number;

  @Field({ nullable: true, description: 'Optional status text; `uploaded` by default.' })
  status?: string;
}
