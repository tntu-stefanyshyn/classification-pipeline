import { Field, InputType, Int } from 'type-graphql';

@InputType()
export class CreateUploadedFileInput {
  @Field()
  filename!: string;

  @Field(() => Int)
  sizeMb!: number;

  @Field({ nullable: true })
  status?: string;
}
