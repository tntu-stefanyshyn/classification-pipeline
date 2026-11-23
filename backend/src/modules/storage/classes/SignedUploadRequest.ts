import { Field, InputType } from 'type-graphql';

@InputType({ description: 'Request for a presigned upload URL.' })
export class SignedUploadRequest {
  @Field({ description: 'Name of the file to upload; it must end with `.csv`.' })
  filename!: string;

  @Field({
    nullable: true,
    description:
      'MIME type of the file; one of `text/csv`, `application/vnd.ms-excel`, `text/plain`.',
  })
  mimeType?: string;
}
