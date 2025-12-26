import { Field, InputType } from 'type-graphql';

@InputType()
export class CreateExperimentInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;
}
