import { Field, ID, InputType } from 'type-graphql';

@InputType()
export class UpdateExperimentInput {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;
}
