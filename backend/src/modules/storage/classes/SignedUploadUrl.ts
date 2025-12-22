import { Field, Int, ObjectType } from 'type-graphql';

@ObjectType()
export class SignedUploadUrl {
  @Field()
  url!: string;

  @Field()
  key!: string;

  @Field(() => Int)
  expiresIn!: number;
}
