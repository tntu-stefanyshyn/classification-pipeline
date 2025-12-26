import { Field, ID, InputType } from 'type-graphql';
import { GraphNodeInput } from './GraphNodeInput';

@InputType()
export class UpdateExperimentInput {
  @Field(() => ID)
  _id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [GraphNodeInput], { nullable: true })
  graphNodes?: GraphNodeInput[];
}
