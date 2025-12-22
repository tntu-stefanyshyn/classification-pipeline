import { Field, InputType } from 'type-graphql';

@InputType()
export class SignedUploadRequest {
  @Field()
  filename!: string;

  @Field({ nullable: true })
  mimeType?: string;
}
