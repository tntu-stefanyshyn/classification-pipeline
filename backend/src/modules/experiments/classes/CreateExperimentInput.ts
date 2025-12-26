import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class CreateExperimentInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => ID, { nullable: true })
  fileId?: string;
}
