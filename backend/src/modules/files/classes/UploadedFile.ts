import { Field, ID, Int, ObjectType } from 'type-graphql';

@ObjectType()
export class UploadedFile {
  @Field(() => ID)
  id!: string;

  @Field()
  filename!: string;

  @Field(() => Int)
  sizeMb!: number;

  @Field()
  status!: string;

  @Field(() => Date)
  uploadedAt!: Date;
}
