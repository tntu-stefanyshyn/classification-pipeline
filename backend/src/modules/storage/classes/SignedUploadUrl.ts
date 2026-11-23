import { Field, Int, ObjectType } from 'type-graphql';

@ObjectType({ description: 'A presigned S3 URL.' })
export class SignedUploadUrl {
  @Field({
    description:
      'The presigned URL. Upload with `PUT`; when a `mimeType` was requested, send it as the `Content-Type`.',
  })
  url!: string;

  @Field({ description: 'The S3 key of the object.' })
  key!: string;

  @Field(() => Int, { description: 'Seconds until the URL expires (`AWS_S3_PRESIGN_EXPIRES`).' })
  expiresIn!: number;
}
